# Branch-Box Architecture

## 1. Project Overview
**Branch-Box** is a serverless web application that automatically provisions and manages isolated development environments on AWS EC2 based on GitHub branches. Developers can select a repository and branch, and the system deploys a dedicated environment using **AWS CodePipeline CI/CD**.

### Key Features
- **One-click Provisioning**: Deploys EC2 instances via CloudFormation based on GitHub branch selection.
- **Automated CI/CD**: Uses **AWS CodePipeline (S3 Source)** to automatically build and deploy code changes when `git push` occurs.
- **Cost Optimization**: Automatically stops instances strictly at 18:00 (6 PM) to save costs.
- **Lifecycle Management**: Automatically deletes/stops environments when branches are merged or deleted via GitHub Webhooks.
- **GitHub Integration**: Uses GitHub App for authentication and repository access, securely stored in **AWS SSM Parameter Store**.

## 2. High-Level Architecture Diagram

```mermaid
graph TD
    User[Developer]
    
    subgraph Frontend [AWS S3 + CloudFront]
        UI[React Web App]
    end
    
    subgraph Backend [AWS Serverless]
        APIGW[API Gateway]
        Cognito[Cognito User Pool]
        L_Main[Lambda: Manager]
        L_Hook[Lambda: Webhook Handler]
        L_Scheduler[Lambda: Scheduler]
        DDB[(DynamoDB)]
        SSM[(SSM Parameter Store)]
        EB[EventBridge Scheduler]
    end
    
    subgraph Infrastructure [Dynamic Environment Stack]
        CF[CloudFormation Stack]
        S3_Art[S3 Artifact Bucket]
        CP[CodePipeline]
        CB[CodeBuild]
        CD[CodeDeploy]
        EC2[EC2 Instance]
    end

    User -->|Login (ID/PW)| Cognito
    User -->|Access UI| UI
    UI -->|Auth Token + API| APIGW
    APIGW -->|Validate Token| Cognito
    APIGW --> L_Main
    
    L_Main -->|Read Config| SSM
    L_Main -->|Read/Write State| DDB
    L_Main -->|Create Stack| CF
    
    GitHub((GitHub)) -->|Download Source using App Token| L_Main
    GitHub -->|Webhook (Push)| APIGW
    
    APIGW --> L_Hook
    L_Hook -->|Trigger Deploy| L_Main
    
    L_Main -->|Upload Source Zip| S3_Art
    S3_Art -->|Trigger Source Action| CP
    CP -->|Build| CB
    CP -->|Deploy| CD
    CD -->|Install/Update App| EC2
    
    EB -->|Trigger 18:00| L_Scheduler
    L_Scheduler -->|Stop Instance| CF
```

## 3. Core Components

### 3.1 Frontend (Presentation Layer)
- **Tech Stack**: React (Vite)
- **Hosting**: AWS S3 (Static Hosting) + CloudFront (CDN & SSL)
- **Role**:
    - Login via GitHub App.
    - List repositories and branches.
    - **Settings**: Configure GitHub App ID/Secret (Stored in SSM).
    - **Dashboard**: Launch environments and trigger manual deployments.

### 3.2 Backend (Logic Layer)
- **API Gateway**: REST API entry point.
- **Lambda Functions**:
    1.  **Environment Manager**: Handles user requests.
        - `POST /envs`: Creates CloudFormation Stack.
        - `POST /deploy`: Downloads source from GitHub and uploads to S3 to trigger pipeline.
        - `POST /config`: Saves GitHub App credentials to SSM.
    2.  **Webhook Handler**: Processes GitHub webhooks (`push`, `delete`, `pull_request`).
        - On `push`: Triggers auto-deployment via S3 upload.
    3.  **Cost Scheduler**: Triggered daily to enforce stop policies.
- **Configuration**:
    - **AWS SSM Parameter Store**: Securely stores GitHub App ID, Private Key, Client Secret.

### 3.3 Database (Persistence Layer)
- **DynamoDB**:
    - **`BranchBox-Environments` Table**:
        - `PK`: `RepoName` | `SK`: `BranchName`
        - `StackId`: CloudFormation Stack ID
        - `Status`: `CREATING`, `RUNNING`, `STOPPED`
        - `Services`: JSON List of services (Repo/Branch/Specs)

### 3.4 Infrastructure Provisioning
- **CloudFormation**:
    - Dynamically generates resources for each environment.
    - **Resources Created**:
        - `AWS::S3::Bucket`: Artifact store for source code and builds.
        - `AWS::CodePipeline`: CI/CD Pipeline (Source -> Build -> Deploy).
        - `AWS::CodeBuild::Project`: Builds artifacts (handles `buildspec.yml`).
        - `AWS::CodeDeploy::Application`: Deploys to EC2.
        - `AWS::EC2::Instance`: The runtime server.
    - **Pipeline Flow**:
        1.  **Source**: S3 (Zip Link). Backend uploads here.
        2.  **Build**: CodeBuild runs build commands.
        3.  **Deploy**: CodeDeploy installs to EC2.

## 4. Workflows

### 4.1 Environment Creation & Initial Deploy
1.  **Create**: User selects Repo + Branch -> `POST /envs`. 
    - Lambda creates CloudFormation Stack (Empty S3 Bucket + Pipeline + EC2).
2.  **Wait**: Stack reaches `CREATE_COMPLETE`.
3.  **Deploy**: User clicks "Deploy" (or triggered automatically).
    - Lambda fetches GitHub Config from SSM.
    - Lambda downloads Source Zip from GitHub.
    - Lambda uploads Zip to the new S3 Bucket.
    - **Result**: CodePipeline starts -> Builds -> Deploys to EC2.

### 4.2 Continuous Delivery (CI/CD)
1.  **Push**: Developer pushes code to GitHub.
2.  **Webhook**: GitHub sends `push` event -> `POST /webhook`.
3.  **Update**: Lambda finds matching Environment.
4.  **Re-upload**: Lambda re-downloads and re-uploads Source Zip to S3.
5.  **Pipeline**: CodePipeline detects S3 update and runs the deployment.

### 4.3 Automated Cost Saving (Daily Stop)
1.  **EventBridge Scheduler** fires at 18:00 KST (09:00 UTC).
2.  **Scheduler Lambda** stops instances.

## 5. Security & Considerations
- **Credentials**: GitHub Private Keys are encrypted in AWS SSM `SecureString`.
- **Isolation**: Each environment has its own EC2 instance and Pipeline.
- **IAM**: Least privilege policies for Lambdas (access only specific SSM paths and DDB tables).
