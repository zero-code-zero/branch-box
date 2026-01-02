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

## Installation & Setup

Follow these steps to deploy Branch-Box to your AWS account and configure the GitHub integration.

### Step 1: Prerequisites & Installation

1.  **Clone the repository**
    ```bash
    git clone https://github.com/zero-code-zero/branch-box.git
    cd branch-box
    ```

2.  **Install Dependencies**
    ```bash
    npm install          # Root (Husky/Lint)
    cd backend/src && npm install && cd ../..
    cd frontend && npm install && cd ..
    ```

3.  **Configure AWS Credentials**
    Ensure you have an IAM User with `AdministratorAccess` keys.
    ```bash
    aws configure
    # Enter Access Key, Secret Key, Region (e.g., ap-northeast-2), Output (json)
    ```

### Step 2: Cloud Deployment

We provide an automated script to handle backend deployment, configuration sync, and frontend deployment.

1.  **Run the Deployment Script**
    ```bash
    ./deploy.sh
    ```
    - This will deploy the backend (AWS SAM) and frontend (S3/CloudFront).
    - **Note the Outputs**: The script will print the **ApiEndpoint** and **FrontendUrl** at the end. You will need these for the next step.

### Step 3: GitHub App Setup

Now that you have your deployment URLs, you must create a GitHub App to allow Branch-Box to detect and manage branches.

1.  **Create GitHub App**
    - Go to **Settings > Developer settings > GitHub Apps > New GitHub App**.
    - **Name**: `Branch-Box-YourName`
    - **Homepage URL**: Your **FrontendUrl** (output from Step 2).
    - **Webhook URL**: Your **ApiEndpoint** + `/webhook` (e.g., `https://xxxx.execute-api.ap-northeast-2.amazonaws.com/webhook`).
    - **Permissions**:
        - `Contents`: Read-only
        - `Metadata`: Read-only
        - `Pull Requests`: Read-only
    - **Events**: `Push`, `Pull Request`

2.  **Install App**
    - Click **Install App** on the left menu and install it on your repository.

3.  **Get Credentials**
    - Note the **App ID**.
    - Generate and download a **Private Key** (`.pem` file).

4.  **Configure Dashboard**
    - Open your **FrontendUrl** in the browser.
    - Click **Settings** in the top right.
    - Enter your **App ID**, **Installation ID**, and **Private Key**.

## Connect to Environments

## Connect to Environments

Once an environment is `RUNNING`, you can securely connect to the EC2 instance using the **SSM Copy Icon** (`📋`) located next to the environment status on the dashboard.

-   **Action**: Clicking the icon copies the `aws ssm start-session` command to your clipboard.
-   **Usage**: Paste and run the command in your terminal (requires AWS CLI + Session Manager Plugin).
-   **Note**: SSH and Public DNS access are not directly exposed to encourage secure access via SSM.

## Development (Dev Mode)

You can run the frontend locally with mock data, bypassing AWS login.

1.  **Enable Dev Mode**
    ```bash
    echo "VITE_DEV_MODE=true" > frontend/.env
    ```

2.  **Start Frontend**
    ```bash
    cd frontend
    npm run dev
    ```
    - Open `http://localhost:5173`. You will see the **(Dev Mode)** indicator.

## Architecture Highlights
-   **Webhook Handler**: Listens for GitHub events to trigger infrastructure changes.
-   **Manager API**: Serves the Dashboard UI.
-   **Scheduler**: Auto-stops environments (default 18:00 KST).
-   **CloudFormation**: Each "Environment" is a separate Stack.


## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the ISC License.
