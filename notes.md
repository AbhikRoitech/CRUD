# MERN Todo App — AWS Deployment Notes (End to End)

## Goal
Host a MERN (React + Node.js + MongoDB Atlas) Todo app on AWS inside a custom VPC with proper security, using Docker Compose on a single EC2.

---

## 1. VPC (vpc-04de6cbe4bb93d6b3 — ToDOAppVPC)
- CIDR: `10.0.0.0/16`
- Why: Isolated network for the app. Not using the default VPC — gives full control over subnets, routing, and security.

## 2. Subnets (4 subnets across 2 AZs)

| Name | CIDR | AZ | Type | Why |
|------|------|----|------|-----|
| public-subnet-a | 10.0.1.0/24 | us-east-1a | Public | Hosts Bastion + ALB |
| public-subnet-b | 10.0.2.0/24 | us-east-1b | Public | ALB needs 2 AZs |
| private-subnet-a | 10.0.11.0/24 | us-east-1a | Private | Hosts App EC2 |
| private-subnet-b | 10.0.12.0/24 | us-east-1b | Private | Future use / HA |

Why public + private: App stays hidden from internet. Only ALB and Bastion are exposed.

## 3. Internet Gateway (igw-0dfdfb678a800faec — ToDOApp-IGW)
- Attached to VPC
- Why: Public subnets need internet access (for ALB to receive traffic, Bastion to be reachable via SSH).

## 4. NAT Gateway (nat-0527ec8697a5bfcd3 — ToDOApp-NAT)
- Placed in: public-subnet-a
- Elastic IP: `34.193.156.200`
- Why: Private EC2 can't reach internet directly. NAT allows outbound only (git clone, docker pull, yum update) while blocking inbound from internet.

## 5. Route Tables

**public-rt (rtb-0293f7571860ecb9a)**
| Destination | Target | Why |
|-------------|--------|-----|
| 10.0.0.0/16 | local | VPC internal traffic |
| 0.0.0.0/0 | IGW | Internet access |
- Associated: public-subnet-a, public-subnet-b

**private-rt (rtb-0f9430281822f5f00)**
| Destination | Target | Why |
|-------------|--------|-----|
| 10.0.0.0/16 | local | VPC internal traffic |
| 0.0.0.0/0 | NAT Gateway | Outbound internet via NAT |
- Associated: private-subnet-a, private-subnet-b

## 6. Security Groups

**bastion-sg (sg-0f7d3f5d1c64125e4)**
| Port | Source | Why |
|------|--------|-----|
| SSH (22) | Your IP (49.42.143.3/32) | Only you can SSH in |

**app-sg (sg-0ccac36cf50c4d884)**
| Port | Source | Why |
|------|--------|-----|
| HTTP (80) | alb-sg | Only ALB can send traffic, not internet directly |
| SSH (22) | bastion-sg | Deploy/manage via Bastion only |

**alb-sg (sg-0c6de65fabaea5330)**
| Port | Source | Why |
|------|--------|-----|
| HTTP (80) | 0.0.0.0/0 | Users access the app through ALB |

Why SG chaining: Each layer only talks to the next. Internet → ALB → App. No shortcuts.

## 7. EC2 Instances

| Name | ID | Subnet | IP | Purpose |
|------|----|--------|----|---------|
| Bastion-Host | i-00b2ca264e3928df0 | public-subnet-a | 3.86.132.178 (EIP) | SSH jump box to reach private EC2 |
| App-EC2 | i-00526993e2f765c46 | private-subnet-a | 10.0.11.222 | Runs both frontend + backend via Docker Compose |

- Key Pair: `27082026`
- AMI: Amazon Linux 2
- Why single EC2: Small app, Docker Compose runs both containers on one machine. Cost effective.
- Why Bastion: Private EC2 has no public IP. Bastion is the only SSH entry point.

## 8. ALB + ASG (Load Balancer + Auto Scaling)

**Why ALB:** App EC2 is in a private subnet — no public IP, users can't reach it directly. ALB sits in public subnets, receives internet traffic, and forwards it to the private EC2s. It also gives you a stable DNS endpoint.

**Why ASG (Auto Scaling Group):** A single EC2 can only handle so much traffic. ASG automatically launches more EC2 instances when traffic spikes (scale out) and terminates extras when traffic drops (scale in). This is horizontal scaling — adding more machines instead of upgrading one.

```
Without ASG:                     With ASG:
                                 
Users → ALB → 1 EC2 (overload)  Users → ALB → EC2-1 (healthy)
                                            → EC2-2 (healthy)
                                            → EC2-3 (launched by ASG)
```

**Setup Steps:**

**Step 1: Create ALB Security Group (alb-sg)**
- Inbound: HTTP (80) from `0.0.0.0/0` — this is the only entry point from the internet
- Outbound: All traffic (default) — so ALB can forward requests to App EC2s
- Why separate SG: Keeps ALB rules isolated. If you add HTTPS later, only this SG changes.

**Step 2: Update App SG (app-sg)**
- Remove: HTTP (80) from `0.0.0.0/0` (was open to internet)
- Add: HTTP (80) from `alb-sg` only
- Why: App EC2s should never receive traffic directly from the internet. Only ALB is allowed to talk to them. This is SG chaining — each layer only accepts traffic from the layer above it.

**Step 3: Create Target Group (todo-app-tg)**
- Protocol: HTTP, Port: 80
- Target type: instance
- Do NOT register instances manually — ASG will do it automatically
- Health check: `GET /` — ALB pings this every 30s to know if an instance is healthy
- If health check fails → ALB stops sending traffic to that instance, ASG replaces it
- Why: Target group is the bridge between ALB and your EC2s. ALB doesn't know about EC2 directly — it sends traffic to the target group, which routes to registered healthy instances.

**Step 4: Create ALB (todo-alb)**
- Scheme: internet-facing (gets a public DNS)
- Subnets: public-subnet-a + public-subnet-b (ALB requires at least 2 AZs for high availability)
- Security group: alb-sg
- DNS: `todo-alb-xxxxx.us-east-1.elb.amazonaws.com`
- Why 2 subnets: ALB distributes across AZs for fault tolerance. If one AZ goes down, the other still serves traffic.

**Step 5: Create Listener**
- Listen on: HTTP port 80
- Default action: forward to target group (todo-app-tg)
- This is the rule that says "when traffic hits ALB on port 80, send it to the app"
- Why: ALB without a listener does nothing. The listener defines what to do with incoming requests.

**Step 6: Create Launch Template**
- AMI: Amazon Linux 2
- Instance type: t2.micro
- Key pair: `27082026`
- Security group: app-sg
- User data script (runs on boot automatically):
  ```bash
  #!/bin/bash
  yum update -y
  yum install -y docker git
  service docker start
  usermod -aG docker ec2-user
  curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  chmod +x /usr/local/bin/docker-compose
  cd /home/ec2-user
  git clone <your-repo-url> CRUD
  cd CRUD
  echo 'MONGO_URI=<your-connection-string>' > .env
  docker-compose up -d --build
  ```
- Why Launch Template: ASG needs a blueprint to know HOW to launch new EC2s. The template defines everything — AMI, instance type, SG, and the user data script that auto-deploys the app on boot. Every new instance launched by ASG comes up with the app already running.
- Why User Data: When ASG launches a new instance at 3 AM due to traffic spike, no one is there to SSH in and deploy. User data makes it fully automatic — instance boots, installs Docker, clones code, runs containers.

**Step 7: Create Auto Scaling Group (todo-asg)**
- Launch template: from Step 6
- Min capacity: 1 (always at least 1 instance running)
- Max capacity: 4 (never more than 4 to control costs)
- Desired capacity: 2 (start with 2 for HA across AZs)
- Subnets: private-subnet-a + private-subnet-b (spreads instances across AZs)
- Target group: todo-app-tg (ASG auto-registers new instances with the ALB)
- Health check type: ELB (uses ALB health check, not just EC2 status check)
- Why ELB health check: EC2 health check only knows if the VM is running. ELB health check knows if the app is responding. If Docker crashes but EC2 is running, ELB health check catches it and ASG replaces the instance.

**Step 8: Create Scaling Policies**

*Scale Out (add instances):*
- Metric: Average CPU > 70% for 2 consecutive minutes
- Action: Add 1 instance
- Cooldown: 300s (wait 5 min before adding another — gives new instance time to warm up)
- Why 70%: Leaves headroom. If you scale at 90%, traffic spike during scale-up could crash existing instances.

*Scale In (remove instances):*
- Metric: Average CPU < 30% for 5 consecutive minutes
- Action: Remove 1 instance
- Cooldown: 300s
- Why slow scale-in: Avoids flapping — scaling in too fast then immediately scaling out again wastes money on instance launch/terminate cycles.

**How ALB + ASG works end-to-end:**
```
User hits ALB DNS (port 80)
  → Listener catches the request
    → Forwards to Target Group
      → Target Group routes to healthy instance (round-robin)
        → EC2-1 (private-subnet-a) OR EC2-2 (private-subnet-b)
          → Nginx serves React / proxies /api/ to backend

Meanwhile ASG watches:
  CPU > 70%? → Launch new EC2 from template → auto-registers with Target Group
  CPU < 30%? → Terminate extra EC2 → auto-deregisters from Target Group
  Instance unhealthy? → Terminate it → Launch replacement
```

**Scaling example:**
```
Normal traffic:  2 instances (desired)
Black Friday:    ASG scales to 4 instances (max)
3 AM quiet:      ASG scales down to 1 instance (min)
Instance crash:  ASG auto-replaces it within minutes
```

## 9. Docker Setup (on App-EC2)

**Why Docker Compose:** Runs both frontend and backend as separate containers on a single EC2. They communicate via Docker's internal network — no need for separate machines or public networking between them.

**Setup Steps:**

**Step 1: docker-compose.yml (project root)**
- Defines 2 services: `frontend` and `backend`
- `frontend`: Builds from `./client`, maps port 80:80, depends on backend
- `backend`: Builds from `./server`, maps port 5000:5000, reads MONGO_URI from `.env`
- `restart: always` — containers auto-restart if they crash or EC2 reboots

**Step 2: Frontend container (Nginx + React)**
- Dockerfile: Multi-stage build — Stage 1 builds React with Vite, Stage 2 copies build output into Nginx
- nginx.conf: Serves static React files on `/`, proxies `/api/*` requests to `backend:5000`
- Why `backend:5000` not `localhost:5000`: Docker Compose creates a network where each service is reachable by its service name. `backend` resolves to the backend container's internal IP.

**Step 3: Backend container (Node.js/Express)**
- Dockerfile: Copies code, runs `npm ci`, starts with `node index.js`
- MONGO_URI passed via environment variable from `.env` file (not baked into image)
- Exposes port 5000 for the API

**Step 4: .env file on EC2 (not in git)**
- Contains `MONGO_URI=mongodb+srv://...`
- docker-compose reads it automatically
- Why not in git: Credentials should never be committed. `.gitignore` excludes it.

## 10. MongoDB Atlas

**Why Atlas:** Managed MongoDB — no need to run a database server on EC2. Handles backups, scaling, and security automatically.

**Setup Steps:**

**Step 1: Whitelist NAT Gateway EIP in Atlas Network Access**
- Go to Atlas → Network Access → Add IP: `34.193.156.200`
- Why this IP: App EC2 is in a private subnet. All its outbound traffic exits through the NAT Gateway, which has this Elastic IP. Atlas sees this as the source IP.

**Step 2: Connection string**
- Format: `mongodb+srv://user:pass@cluster0.xxx.mongodb.net/ToDoAPP`
- TLS encrypted by default (port 27017)
- Stored in `.env` on EC2, passed to backend container via docker-compose

**Step 3: Verify connectivity**
- From App-EC2: `curl -v telnet://cluster0.8iiqxqw.mongodb.net:27017` — should connect
- If it fails: check NAT Gateway is running, private route table has 0.0.0.0/0 → NAT, and Atlas whitelist is correct

---

## Traffic Flow
```
Users
  → ALB (todo-alb, public subnets, port 80)
    → App-EC2 (private subnet, port 80)
      → Nginx container (serves React + proxies /api/)
        → Backend container (Express, port 5000)
          → MongoDB Atlas (TLS, port 27017)
```

## SSH Flow
```
Your PC → Bastion (3.86.132.178, port 22) → App-EC2 (10.0.11.222, port 22)
```

## Deploy Commands (on App-EC2 via Bastion)
```bash
# Install Docker & Git
sudo yum update -y
sudo yum install -y docker git
sudo service docker start
sudo usermod -aG docker ec2-user
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose
# Logout and login again

# Clone and run
git clone <your-repo-url>
cd CRUD
echo 'MONGO_URI=<your-connection-string>' > .env
docker-compose up -d --build
```

## App URL
```
http://todo-alb-2142456100.us-east-1.elb.amazonaws.com
```
