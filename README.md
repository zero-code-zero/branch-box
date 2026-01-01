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

### GitHub App Setup (Required)

To allow Branch-Box to detect branches and download code, you must create a GitHub App.

1.  **Create GitHub App**:
    - Go to **Settings > Developer settings > GitHub Apps > New GitHub App**.
    - **Name**: `Branch-Box-YourName`
    - **Homepage URL**: Your CloudFront URL (or `http://localhost:5173` for dev).
    - **Webhook URL**: The **ApiEndpoint** + `/webhook` (e.g., `https://api.xyz.com/webhook`).
    - **Permissions**:
        - `Contents`: Read-only (to download code).
        - `Metadata`: Read-only.
    - **Events**: `Push`, `Pull Request`.

2.  **Install App**:
    - After creating, click **Install App** on the left menu and install it on your repository.

3.  **Get Credentials**:
    - Note the **App ID**.
    - Generate and download a **Private Key** (`.pem` file).

4.  **Configure Dashboard**:
    - Open your deployed Branch-Box Dashboard.
    - Click **Settings** in the top right.
    - Enter your **App ID**, **Installation ID** (found in URL after install), and the content of your **Private Key**.

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

Branch-Box can be run in two modes: **Dev Mode** (Local) and **Production Mode** (Cloud).

### 1. Dev Mode (Local Development)
Ideal for UI development without connecting to real AWS resources. It mocks API responses and bypasses authentication.

1.  **Create a `.env` file** in the `frontend` directory:
    ```bash
    echo "VITE_DEV_MODE=true" > frontend/.env
    ```

2.  **Start the frontend**:
    ```bash
    cd frontend
    npm run dev
    ```

3.  Open `http://localhost:5173`. You will see a **(Dev Mode)** indicator and can use the dashboard with mock data.

### 2. Production Mode (Cloud Connected)
Connects to the real AWS backend (`api setup required`).

1.  **Ensure `.env` does NOT have `VITE_DEV_MODE=true`** (or set it to `false`).
2.  **Start the frontend**:
    ```bash
    npm run dev
    ```
3.  The app will redirect to the **Cognito Login Page**.
4.  After login, it will make real API calls to your AWS API Gateway.


### AWS Credentials Setup
Before deploying, you must configure your AWS credentials to allow the CLI tools to create resources on your behalf.

1.  **Create an IAM User**:
    - Go to the AWS IAM Console.
    - Create a user with `AdministratorAccess` (or sufficient permissions for CloudFormation, S3, IAM, etc.).
    - Generate an **Access Key** and **Secret Access Key** for this user.

2.  **Configure CLI**:
    Run the following command and enter your keys when prompted:
    ```bash
    aws configure
    ```
    - **Region**: `ap-northeast-2` (or your preferred region)
    - **Output format**: `json`

### Cloud Deployment (Production)

This project uses **AWS SAM** for the backend and **S3 + CloudFront** for the frontend.

#### 1. Deploy Backend & Infrastructure
This step creates the API, Database, Auth, and the Frontend Hosting infrastructure (S3 Bucket & CloudFront).

1.  Navigate to the backend directory:
    ```bash
    cd backend
    ```

2.  Build and Deploy:
    ```bash
    sam build
    sam deploy --guided
    ```
    - **Stack Name**: `branch-box`
    - **Region**: `ap-northeast-2`
    - **Confirm changes**: `y`
    - **Allow IAM role creation**: `y`
    - **Save arguments**: `y`

3.  **Note the Outputs**:
    After a successful deploy, the terminal will show important outputs. Copy these values:
    - `ApiEndpoint`
    - `UserPoolId`
    - `UserPoolClientId`
    - `FrontendBucketName` (e.g., `branch-box-frontendbucket-xxxx`)
    - `FrontendUrl` (e.g., `https://d1234.cloudfront.net`)

#### 2. Build & Deploy Frontend
Now, build the React application and upload it to the newly created S3 bucket.

1.  Navigate to the frontend directory:
    ```bash
    cd ../frontend
    ```

2.  **Build**:
    The build process will automatically use the environment variables from your setup if configured, or you can create a `.env.production` file.
    ```bash
    npm run build
    ```

3.  **Upload to S3**:
    Replace `[FrontendBucketName]` with the actual bucket name from the backend outputs.
    ```bash
    aws s3 sync ./dist s3://[FrontendBucketName] --delete
    ```

4.  **Invalidate Cache (Optional)**:
    If updating an existing deployment, invalidate the CloudFront cache to see changes immediately.
    ```bash
    aws cloudfront create-invalidation --distribution-id [DistributionID] --paths "/*"
    ```

#### 3. Access the Application
Open the **FrontendUrl** (e.g., `https://d1234.cloudfront.net`) in your browser. You should see the Branch-Box login page.

## Architecture Highlights

-   **Webhook Handler**: Listens for GitHub events (push, pull_request) to trigger infrastructure changes.
-   **Manager API**: Serves the Dashboard UI for listing and controlling environments.
-   **Scheduler**: Automatically stops environments at a configured time (e.g., 6 PM KST).
-   **CloudFormation**: Each "Environment" is a separate CloudFormation stack containing the EC2 instance and related resources.

## Contributing

Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines on how to contribute to this project.

## License

This project is licensed under the ISC License.
