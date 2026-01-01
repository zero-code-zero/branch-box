# Branch-Box

**Branch-Box** is a Serverless AWS Infrastructure Manager designed to automate the deployment and management of EC2 environments based on GitHub branches. It allows developers to easily create, manage, and access ephemeral environments for their feature branches.

## Features

-   **GitHub Integration**: Automatically detects branches and Pull Requests to manage environments.
-   **Automated Deployment**: Uses AWS CloudFormation to provision EC2 instances, CodePipeline, and S3 buckets for each branch.
-   **Dashboard UI**: A React-based dashboard to view environment status, logs, and manage lifecycles.
-   **Cost Optimization**: Includes an **Auto-Stop** scheduler (default 18:00 KST) to prevent unnecessary billing for idle instances.
-   **Secure Access**: Uses AWS Systems Manager (SSM) Session Manager for secure shell access without opening SSH ports.

## Tech Stack

### Frontend
-   **Framework**: React (Vite)
-   **Styling**: Tailwind CSS
-   **State Management**: React Hooks & Context
-   **Hosting**: AWS S3 & CloudFront (typical setup)

### Backend
-   **Runtime**: Node.js 20.x
-   **Infrastructure as Code**: AWS SAM (Serverless Application Model)
-   **Compute**: AWS Lambda
-   **Database**: Amazon DynamoDB
-   **API**: Amazon API Gateway (HTTP API)
-   **Auth**: Amazon Cognito
-   **Scheduling**: Amazon EventBridge Scheduler

## Prerequisites

Before running this project, ensure you have the following installed:

-   [Node.js](https://nodejs.org/) (v20 or later recommended)
-   [AWS CLI](https://aws.amazon.com/cli/) (configured with appropriate credentials)
-   [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html)
-   [Git](https://git-scm.com/)

## Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/zero-code-zero/branch-box.git
    cd branch-box
    ```

2.  **Install Root Dependencies** (for Husky & Lint-staged)
    ```bash
    npm install
    ```

3.  **Install Backend Dependencies**
    ```bash
    cd backend/src
    npm install
    cd ../..
    ```

4.  **Install Frontend Dependencies**
    ```bash
    cd frontend
    npm install
    cd ..
    ```

## Usage

### Running Locally (Frontend)

To start the frontend development server:

```bash
cd frontend
npm run dev
```

The application will be available at `http://localhost:5173`.

> **Note**: The frontend requires a backend API. Ensure you have deployed the backend or have a local emulator running.

### Deploying Backend (AWS)

To deploy the serverless backend to your AWS account:

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```

2.  Build and Deploy using SAM:
    ```bash
    sam build
    sam deploy --guided
    ```

    Follow the prompts to configure:
    -   **Stack Name**: e.g., `branch-box-backend`
    -   **AWS Region**: e.g., `ap-northeast-2`
    -   **Parameter Overrides**: defaults are usually fine
    -   **Confirm changes before deploy**: `y`
    -   **Allow SAM CLI IAM role creation**: `y`

3.  **Post-Deployment**:
    -   Note the **API Gateway Endpoint URL** and **Cognito User Pool IDs** from the `sam deploy` outputs.
    -   Update the frontend configuration (e.g., `.env` file) with these values.

## Architecture Highlights

-   **Webhook Handler**: Listens for GitHub events (push, pull_request) to trigger infrastructure changes.
-   **Manager API**: Serves the Dashboard UI for listing and controlling environments.
-   **Scheduler**: Automatically stops environments at a configured time (e.g., 6 PM KST).
-   **CloudFormation**: Each "Environment" is a separate CloudFormation stack containing the EC2 instance and related resources.

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the ISC License.
