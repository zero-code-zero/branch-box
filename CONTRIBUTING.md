# Contributing to Branch-Box

## Getting Started

1.  **Clone the repository**:
    ```bash
    git clone https://github.com/your-org/branch-box.git
    cd branch-box
    ```

2.  **Install dependencies**:
    ```bash
    # Root dependencies (Husky, Lint-Staged)
    npm install
    
    # Backend dependencies
    cd backend/src
    npm install
    cd ../..
    
    # Frontend dependencies
    cd frontend
    npm install
    cd ..
    ```

## Development Workflow

### Frontend
- Navigate to `frontend`
- Run `npm run dev` to start the development server.
- Run `npm run lint` to check for linting errors.
- Run `npm run format` (if available) to format code.

### Backend
- Navigate to `backend/src`
- Run `npm run lint` to check for linting errors.
- Run `npm run format` to format code.
- To deploy, follow the AWS SAM deployment instructions (usually `sam deploy`).

### Commit Guidelines
We use `husky` and `lint-staged` to ensure code quality.
- **Pre-commit**: Automatically runs linting and formatting on staged files.
- Please write clear and concise commit messages.

## Code Style
- **JavaScript**: We use ESLint and Prettier.
- **Formatting**: Ensure your code is formatted before committing.
