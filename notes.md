1. Security Groups

bastion-sg — Allow SSH (22) from your IP only
frontend-sg — Allow HTTP (80) from Bastion SG
backend-sg — Allow port 5000 from Frontend SG only
bastion-sg (sg-0f7d3f5d1c64125e4)

Type	Port	Source	Purpose
SSH	22	49.42.143.3/32 (your IP)	Your SSH access
frontend-sg (sg-0519eadac4ad4a571)

Type	Port	Source	Purpose
HTTP	80	0.0.0.0/0	Users access the app
SSH	22	bastion-sg	Deploy/manage via Bastion
backend-sg (sg-091c9f59b2d364d36)

Type	Port	Source	Purpose
Custom TCP	5000	frontend-sg	Frontend proxies API calls
SSH	22	bastion-sg	Deploy/manage via Bastion
Traffic flow: Users → Frontend (80) → Nginx proxies /api/ → Backend (5000) → MongoDB Atlas

2. Key Pair

Create an SSH key pair for EC2 access
3. EC2 Instances

Bastion Host — t2.micro in public-subnet-a (jump box for SSH)
Frontend EC2 — t2.micro in private-subnet-a (10.0.11.0/24) — React + Nginx via Docker
Backend EC2 — t2.micro in private-subnet-b (10.0.12.0/24) — Node.js/Express via Docker
4. On each EC2 (via Bastion SSH)

Install Docker & Git
Git clone your repo
Backend EC2: docker build & run the server (pass MONGO_URI as env var)
Frontend EC2: Update BACKEND_IP in nginx.conf, then docker build & run
5. MongoDB Atlas

Whitelist the NAT Gateway's Elastic IP (34.193.156.200) in Atlas Network Access
6. Push code to GitHub

Add a .gitignore at the root
Create a GitHub repo and push