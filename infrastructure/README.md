# Infrastructure

This directory contains infrastructure as code, deployment configurations, monitoring setups, and Docker configurations for the Delego platform.

## 📋 Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Docker Configuration](#docker-configuration)
- [Terraform Configuration](#terraform-configuration)
- [Monitoring](#monitoring)
- [Deployment](#deployment)
- [Local Development](#local-development)
- [Production Infrastructure](#production-infrastructure)
- [Security](#security)

## Overview

The infrastructure directory contains all infrastructure-related configurations for deploying and managing the Delego platform across different environments.

### Infrastructure Principles

- **Infrastructure as Code**: All infrastructure defined in code
- **Environment Parity**: Similar configurations across environments
- **Security First**: Security integrated into infrastructure design
- **Scalability**: Designed for horizontal scaling
- **Observability**: Comprehensive monitoring and logging

## Directory Structure

```
infrastructure/
├── docker/              # Docker configurations
│   ├── README.md        # Docker setup guide
│   └── *.yml            # Docker Compose files
├── terraform/           # Terraform configurations
│   ├── README.md        # Terraform setup guide
│   └── *.tf             # Terraform files
├── monitoring/          # Monitoring configurations
│   ├── README.md        # Monitoring setup guide
│   └── *.yml            # Monitoring configs
└── deployment/          # Deployment scripts
    ├── README.md        # Deployment guide
    └── *.sh             # Deployment scripts
```

## Docker Configuration

### Docker Compose

The root `docker-compose.yml` file defines the local development infrastructure:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: delego
      POSTGRES_USER: delego
      POSTGRES_PASSWORD: delego
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  postgres_data:
  redis_data:
```

### Docker Services

#### PostgreSQL

- **Image**: postgres:15-alpine
- **Port**: 5432
- **Database**: delego
- **User**: delego
- **Password**: delego (development only)
- **Volume**: Persistent data storage

#### Redis

- **Image**: redis:7-alpine
- **Port**: 6379
- **Volume**: Persistent data storage

### Docker Commands

```bash
# Start all services
pnpm docker:up

# Stop all services
pnpm docker:down

# View logs
docker-compose logs -f

# Restart services
docker-compose restart

# Remove volumes (WARNING: deletes data)
docker-compose down -v
```

## Terraform Configuration

### Terraform Setup

Terraform is used for infrastructure provisioning in cloud environments (AWS, GCP, Azure).

### Terraform Structure

```
terraform/
├── main.tf              # Main configuration
├── variables.tf         # Variable definitions
├── outputs.tf           # Output definitions
├── provider.tf          # Provider configuration
└── modules/             # Reusable modules
    ├── vpc/
    ├── database/
    └── kubernetes/
```

### Terraform Commands

```bash
# Initialize Terraform
cd terraform
terraform init

# Plan changes
terraform plan

# Apply changes
terraform apply

# Destroy infrastructure
terraform destroy

# Format configuration
terraform fmt

# Validate configuration
terraform validate
```

### Terraform Modules

#### VPC Module

Creates Virtual Private Cloud infrastructure:
- VPC with public and private subnets
- Internet Gateway
- NAT Gateway
- Route tables
- Security groups

#### Database Module

Provisions database infrastructure:
- RDS PostgreSQL instance
- Read replicas
- Parameter groups
- Security groups
- Backup configuration

#### Kubernetes Module

Sets up Kubernetes cluster:
- EKS/GKE/AKS cluster
- Node groups
- IAM roles
- Networking
- Storage classes

## Monitoring

### Monitoring Stack

The monitoring infrastructure includes:

#### Prometheus

- **Purpose**: Metrics collection and storage
- **Port**: 9090
- **Retention**: 30 days
- **Scrape Interval**: 15 seconds

#### Grafana

- **Purpose**: Visualization and dashboards
- **Port**: 3000
- **Dashboards**: System, application, and business metrics

#### AlertManager

- **Purpose**: Alert routing and management
- **Port**: 9093
- **Integrations**: Email, Slack, PagerDuty

### Monitoring Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'delego'
    static_configs:
      - targets: ['gateway:3000', 'orchestrator:3010']
```

### Monitoring Dashboards

Pre-configured Grafana dashboards:
- System Overview
- Application Performance
- Database Performance
- Redis Performance
- Business Metrics

### Alerting Rules

Critical alerts:
- Service down
- High error rate
- High latency
- Database connection issues
- Redis connection issues

## Deployment

### Deployment Strategies

#### Development

- **Environment**: Local Docker Compose
- **Database**: PostgreSQL in Docker
- **Redis**: Redis in Docker
- **Deployment**: Manual

#### Staging

- **Environment**: Kubernetes cluster
- **Database**: Managed PostgreSQL (RDS)
- **Redis**: Managed Redis (ElastiCache)
- **Deployment**: CI/CD pipeline

#### Production

- **Environment**: Kubernetes cluster (multi-region)
- **Database**: Managed PostgreSQL with replication
- **Redis**: Managed Redis with clustering
- **Deployment**: CI/CD with blue-green deployment

### Deployment Scripts

Deployment scripts are located in `infrastructure/deployment/`:

```bash
# Deploy to staging
./deploy.sh staging

# Deploy to production
./deploy.sh production

# Rollback deployment
./rollback.sh production
```

### CI/CD Pipeline

GitHub Actions workflow for CI/CD:

```yaml
name: Deploy

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build
        run: pnpm build
      - name: Test
        run: pnpm test
      - name: Deploy
        run: ./infrastructure/deployment/deploy.sh production
```

## Local Development

### Prerequisites

- Docker >= 24.0.0
- Docker Compose >= 2.20.0
- Node.js >= 20.0.0
- pnpm >= 9.0.0

### Setup

```bash
# Clone repository
git clone https://github.com/your-org/delego.git
cd delego

# Install dependencies
pnpm install

# Start infrastructure
pnpm docker:up

# Run migrations
pnpm db:migrate

# Seed database
pnpm db:seed

# Start development
pnpm dev
```

### Accessing Services

- **Web App**: http://localhost:3001
- **API Gateway**: http://localhost:3000
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Production Infrastructure

### Architecture

Production infrastructure follows a multi-region, highly available architecture:

```
┌─────────────────────────────────────────────────┐
│                   CDN / Load Balancer            │
└────────────────────┬────────────────────────────┘
                     │
        ┌────────────┼────────────┐
        │            │            │
        v            v            v
┌──────────┐  ┌──────────┐  ┌──────────┐
│ Region A │  │ Region B │  │ Region C │
│          │  │          │  │          │
│ K8s Cluster│  │ K8s Cluster│  │ K8s Cluster│
│          │  │          │  │          │
│ RDS      │  │ RDS      │  │ RDS      │
│ Redis    │  │ Redis    │  │ Redis    │
└──────────┘  └──────────┘  └──────────┘
```

### Components

#### Kubernetes Cluster

- **Provider**: AWS EKS / GCP GKE / Azure AKS
- **Node Type**: Managed node groups
- **Auto-scaling**: Horizontal Pod Autoscaler
- **Networking**: VPC with private subnets

#### Database

- **Type**: PostgreSQL 15
- **Provider**: AWS RDS / Google Cloud SQL
- **Configuration**: Multi-AZ deployment
- **Replication**: Read replicas for scaling
- **Backup**: Automated daily backups

#### Cache

- **Type**: Redis 7
- **Provider**: AWS ElastiCache / Google Memorystore
- **Configuration**: Cluster mode enabled
- **Replication**: Multi-AZ deployment

#### Storage

- **Type**: Object storage (S3 / GCS)
- **Use Case**: Static assets, logs, backups
- **Lifecycle**: Automated retention policies

### Security

#### Network Security

- **VPC**: Isolated virtual private cloud
- **Security Groups**: Restrictive firewall rules
- **Private Subnets**: Services in private subnets only
- **Bastion Host**: Secure access to private resources

#### Application Security

- **TLS/SSL**: All communication encrypted
- **Secrets Management**: AWS Secrets Manager / HashiCorp Vault
- **IAM**: Least privilege access
- **Audit Logging**: CloudTrail / Cloud Audit Logs

#### Infrastructure Security

- **Vulnerability Scanning**: Regular security scans
- **Dependency Scanning**: Automated dependency checks
- **Penetration Testing**: Regular security assessments
- **Compliance**: SOC 2, GDPR compliance (planned)

## Security

### Security Best Practices

- **Secrets Management**: Never commit secrets to version control
- **Least Privilege**: Grant minimum necessary permissions
- **Encryption**: Encrypt data at rest and in transit
- **Monitoring**: Monitor for security events
- **Updates**: Regular security updates and patches

### Security Tools

- **Trivy**: Container vulnerability scanning
- **Snyk**: Dependency vulnerability scanning
- **AWS Security Hub**: Security posture monitoring
- **CloudWatch Logs**: Centralized logging

### Incident Response

- **Detection**: Automated alerting for security events
- **Response**: Incident response procedures
- **Recovery**: Disaster recovery procedures
- **Post-Incident**: Post-incident analysis

## Troubleshooting

### Docker Issues

**Container won't start**
```bash
# Check logs
docker-compose logs <service>

# Restart container
docker-compose restart <service>

# Rebuild container
docker-compose up -d --build <service>
```

**Database connection issues**
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Check logs
docker-compose logs postgres

# Restart PostgreSQL
docker-compose restart postgres
```

### Terraform Issues

**State lock issues**
```bash
# Force unlock state
terraform force-unlock <LOCK_ID>

# Refresh state
terraform refresh
```

**Resource creation failures**
```bash
# Check Terraform logs
terraform plan -out=tfplan
terraform apply tfplan

# Check cloud provider console for errors
```

### Monitoring Issues

**Metrics not appearing**
```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Check Prometheus logs
docker-compose logs prometheus

# Restart Prometheus
docker-compose restart prometheus
```

## Documentation

- [Docker Documentation](https://docs.docker.com/)
- [Terraform Documentation](https://www.terraform.io/docs)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)

---

**Last Updated**: June 2026
