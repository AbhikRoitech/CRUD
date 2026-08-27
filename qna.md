# MERN Todo App on AWS — 30 Interview Q&A

## Interview Prep + Concept Clarity

### 1. Why did you create a custom VPC instead of using the default VPC?
**Answer:** A custom VPC gives complete control over the network architecture, including CIDR ranges, public/private subnets, routing, and security boundaries. In this application, it lets us keep the application EC2 instances private while exposing only the required entry points.

**Scenario:** If an interviewer asks, "What is the benefit in production?", say:  
> "I can deliberately separate internet-facing resources from internal application resources instead of relying on the default network layout."

---

### 2. Why is the VPC CIDR `10.0.0.0/16`?
**Answer:** It provides a large private IP address range from which smaller subnet ranges can be created. The project uses `/24` subnets such as `10.0.1.0/24` and `10.0.11.0/24`.

**Scenario:** If the application grows, more subnets can be created inside the VPC without redesigning the whole address space.

---

### 3. Why do you have both public and private subnets?
**Answer:** Public subnets are used for resources that need to receive internet traffic, such as the internet-facing ALB and Bastion host. Private subnets contain application EC2 instances so they are not directly reachable from the internet.

**Scenario:** If an attacker knows the private EC2's IP, they still cannot directly connect to it from the internet because it has no public IP and its security group only permits the required sources.

---

### 4. Why are there two public subnets in two Availability Zones?
**Answer:** The ALB uses multiple Availability Zones for fault tolerance. If one AZ has a problem, the ALB can continue serving traffic through another AZ.

**Scenario:** If `us-east-1a` becomes unavailable, the ALB can still operate through `us-east-1b`.

---

### 5. Why is there a NAT Gateway in the public subnet?
**Answer:** Private EC2 instances need outbound internet access for activities such as `git clone`, Docker image downloads, and system updates, but they should not accept inbound internet connections. The NAT Gateway provides outbound internet access for private resources.

**Scenario:** The App EC2 downloads a Docker image. The request goes from the private subnet through the NAT Gateway and Internet Gateway to the internet. The internet cannot initiate a new connection directly to the private EC2.

---

### 6. Why does the private route table point `0.0.0.0/0` to the NAT Gateway?
**Answer:** `0.0.0.0/0` represents destinations outside the VPC. Sending that traffic to the NAT Gateway allows private instances to reach external services through NAT.

**Scenario:** When `yum update` or `docker pull` runs on the private EC2, the route table sends the outbound traffic toward NAT.

---

### 7. Why does the public route table point `0.0.0.0/0` to the Internet Gateway?
**Answer:** Public resources need a direct path to and from the internet. The Internet Gateway provides that internet connectivity for resources in the public subnets.

**Scenario:** A user sends an HTTP request to the ALB. The ALB is in a public subnet whose default route goes to the Internet Gateway.

---

### 8. What is the difference between an Internet Gateway and a NAT Gateway?
**Answer:** An Internet Gateway provides internet connectivity for resources that are publicly reachable, while a NAT Gateway allows private resources to initiate outbound internet connections without exposing them to inbound internet traffic.

**Scenario:** ALB uses the Internet Gateway path; private App EC2 uses the NAT Gateway path.

---

### 9. Why is the Bastion host in a public subnet?
**Answer:** The Bastion host is the controlled SSH entry point into the private application environment. Because the App EC2 has no public IP, administrators first connect to the Bastion and then SSH into the private EC2.

**Scenario:** The SSH flow is:
`Your PC → Bastion → Private App EC2`.

---

### 10. Why does the Bastion security group allow SSH only from your IP?
**Answer:** Restricting SSH port 22 to a specific trusted IP reduces the attack surface. Instead of allowing SSH from the whole internet, only the required administrator source is allowed.

**Scenario:** If someone tries SSH from another IP, the security group blocks the connection.

---

### 11. Why should the App EC2 security group not allow HTTP from `0.0.0.0/0`?
**Answer:** The App EC2 should not be directly accessible from the internet. HTTP traffic should come only from the ALB security group.

**Scenario:** The correct chain is:
`Internet → ALB → App EC2`.

This prevents users from bypassing the load balancer.

---

### 12. What is security-group chaining and why did you use it?
**Answer:** Security-group chaining means allowing one layer to communicate with another layer by referencing its security group instead of opening access broadly by IP.

**Scenario:** `app-sg` allows HTTP from `alb-sg`, so only resources associated with `alb-sg` can send HTTP traffic to the application.

---

### 13. Why do you need an Application Load Balancer?
**Answer:** The application instances are private and do not have public IPs. The ALB provides a stable public endpoint, receives user requests, and forwards them to healthy application instances.

**Scenario:** A user does not need to know which EC2 instance is running the application. The user only accesses the ALB DNS name.

---

### 14. Why does the ALB need a listener?
**Answer:** The listener defines how the ALB handles incoming traffic. In this project, the listener accepts HTTP traffic on port 80 and forwards it to the target group.

**Scenario:** Without a listener, the ALB may exist, but there is no rule telling it what to do with an incoming HTTP request.

---

### 15. Why do you use a Target Group between the ALB and EC2?
**Answer:** The target group is the logical collection of backend targets to which the ALB sends traffic. It also provides health-check information so the ALB knows which instances are healthy.

**Scenario:** If one EC2 fails its health check, the ALB stops sending requests to it.

---

### 16. Why is the ALB health check `GET /` important?
**Answer:** It verifies that the application is actually responding, not merely that the EC2 virtual machine is running.

**Scenario:** If Docker or Nginx crashes while the EC2 itself remains powered on, the application health check can fail. The unhealthy instance is then removed from normal traffic, and the ASG can replace it.

---

### 17. Why did you use an Auto Scaling Group?
**Answer:** An ASG automatically manages the number of EC2 instances according to configured capacity and scaling rules. It can add instances during high demand, remove unnecessary instances during low demand, and replace unhealthy instances.

**Scenario:** During a traffic spike, the ASG can launch additional EC2 instances from the launch template.

---

### 18. Why is Desired Capacity 2, while Min is 1 and Max is 4?
**Answer:** Desired capacity is the normal starting number of instances. A minimum of 1 controls the lowest capacity, while a maximum of 4 limits how far the system can scale.

**Scenario:** Normal traffic may run with 2 instances. A major spike can scale to 4, while quiet periods can scale down to 1.

---

### 19. Why do ASG instances run in private subnets across two AZs?
**Answer:** Private subnets protect the application instances from direct internet exposure, while distributing instances across two AZs improves availability.

**Scenario:** If one AZ has an infrastructure problem, an instance in the other AZ can continue serving traffic through the ALB.

---

### 20. Why use a Launch Template with the ASG?
**Answer:** The launch template is the blueprint for creating new EC2 instances. It specifies the AMI, instance type, key pair, security group, and startup configuration.

**Scenario:** If the ASG needs a third EC2 at 3 AM, it can launch it consistently without an administrator manually configuring the machine.

---

### 21. Why use EC2 User Data?
**Answer:** User Data automates configuration during instance startup. It installs Docker and Git, downloads the application code, creates the environment configuration, and starts Docker Compose.

**Scenario:** A newly launched ASG instance can become application-ready automatically instead of requiring someone to SSH into it and deploy manually.

---

### 22. Why use ELB health checks instead of only EC2 health checks?
**Answer:** An EC2 health check mainly tells us whether the virtual machine is functioning. An ELB health check verifies whether the application is responding correctly to requests.

**Scenario:** The EC2 can be "running" while the Docker container is broken. An ELB health check can detect that application-level failure.

---

### 23. Why scale out when CPU is above 70% instead of waiting for 90%?
**Answer:** Scaling at 70% leaves headroom for additional traffic while a new instance is starting. Waiting until 90% could allow existing instances to become overloaded before the new instance is ready.

**Scenario:** During a sudden traffic spike, the ASG starts scaling before the existing instances are critically overloaded.

---

### 24. Why is scale-in slower than scale-out?
**Answer:** The configuration waits for CPU to remain below 30% for five minutes before removing an instance. This reduces unnecessary instance launches and terminations caused by short traffic fluctuations.

**Scenario:** If traffic briefly drops for one minute and immediately rises again, the ASG should avoid terminating an instance and then launching it again.

---

### 25. Why did you use Docker Compose?
**Answer:** Docker Compose runs the frontend and backend as separate containers while managing them together. It also provides an internal Docker network so the services can communicate by service name.

**Scenario:** The React/Nginx frontend can communicate with the backend using `backend:5000` instead of exposing the backend publicly.

---

### 26. Why does Nginx proxy `/api/*` to `backend:5000` instead of `localhost:5000`?
**Answer:** In Docker Compose, containers communicate over a Docker network using service names. `backend` resolves to the backend container's internal address.

**Scenario:** `localhost` inside the frontend container means the frontend container itself, not the backend container. Therefore `backend:5000` is the correct destination.

---

### 27. Why use a multi-stage Docker build for the React frontend?
**Answer:** The first stage builds the React application, and the second stage serves the generated static files using Nginx. This separates the build environment from the runtime environment.

**Scenario:** The final frontend container only needs the built React files and Nginx rather than all the build tooling.

---

### 28. Why keep `MONGO_URI` in `.env` instead of putting it in Git or the Docker image?
**Answer:** The MongoDB connection string contains credentials and should not be committed to source control or baked into a reusable image. The backend receives it as an environment variable at runtime.

**Scenario:** The same Docker image can be deployed in different environments while each environment supplies its own database credentials.

---

### 29. Why use MongoDB Atlas instead of running MongoDB on the EC2 instance?
**Answer:** MongoDB Atlas is a managed database service, so the application does not need to manage the database server directly. The notes identify managed backups, scaling, and security as key benefits.

**Scenario:** The application EC2 can focus on running the frontend and backend while Atlas handles the database service.

---

### 30. Explain the complete request and deployment flow.
**Answer:** A user accesses the public ALB. The ALB listener accepts HTTP traffic and forwards it to the target group. The target group sends the request to a healthy private EC2. Nginx serves the React frontend and proxies `/api/` requests to the backend container. The Express backend connects to MongoDB Atlas over the configured connection.

The operational flow is:
`User → ALB → Private EC2 → Nginx → Backend → MongoDB Atlas`

For administration:
`Your PC → Bastion → Private App EC2`

For private outbound internet access:
`Private EC2 → NAT Gateway → Internet Gateway → Internet`

For automatic scaling:
`High CPU → ASG launches EC2 from Launch Template → instance registers with Target Group`

For failure recovery:
`Unhealthy instance → ALB stops routing → ASG replaces instance`

**Interview tip:** Explain the architecture as a chain and repeatedly connect each AWS component to its purpose: **security, availability, scalability, or automation**.
