# Branch-Box Project Rules & Guidelines

## 1. Project Context
- **Name**: Branch-Box (Serverless AWS Infrastructure Manager)
- **Goal**: GitHub 브랜치 기반 EC2 환경 자동 배포 및 관리.
- **Frontend**: React (Vite), Tailwind CSS (Location: `/frontend`)
- **Backend**: Node.js, AWS SDK (S3, CloudFormation, DynamoDB, SSM) (Location: `/backend`)

## 2. UI/UX Consistency Rules (CRITICAL)
프론트엔드 작업 시 AI는 반드시 다음 UI 업데이트 프로세스를 준수해야 함:

### A. State-UI Synchronization
- **API Response Handling**: 백엔드 API 호출 후 결과(Success/Fail)를 반드시 UI(Toast, Alert, 또는 상태 텍스트)로 사용자에게 즉시 알려야 함.
- **Loading Indicators**: `fetch` 또는 `axios` 요청 중에는 해당 버튼을 `disabled` 처리하거나 스피너를 표시하여 중복 요청을 방지함.
- **Data Re-validation**: `POST`, `DELETE` 요청 성공 시, 관련된 리스트 데이터를 다시 불러오거나(Refetch) 상태를 수동으로 업데이트하여 즉시 반영할 것.

### B. Dashboard State Management
- **Environment Status**: DynamoDB의 `Status` 필드(`CREATING`, `RUNNING`, `STOPPED`, `DELETING`)를 시각적으로 구분(색상 태그 등)하여 표시할 것.
- **Dynamic Polling**: 상태가 `CREATING` 또는 `DELETING`인 경우, 완료될 때까지 주기적으로 상태를 체크하는 폴링 로직을 UI에 포함할 것.

## 3. Implementation Standards
- **Component Pattern**: 
    - UI 요소와 로직(API 호출)을 분리할 것. 
    - 가급적 비즈니스 로직은 Custom Hooks (`/src/hooks`)로 추출할 것.
- **Naming**: 
    - 컴포넌트: PascalCase (예: `EnvCard.jsx`)
    - 함수/변수: camelCase
- **Pathing**: `@/` 별칭(Alias)을 사용하여 절대 경로로 임포트할 것.

## 4. Architecture Reference
- **Infrastructure**: CloudFormation을 통해 EC2, CodePipeline, S3가 한 세트로 묶임.
- **Security**: GitHub App Token 등 민감 정보는 항상 SSM Parameter Store에서 읽어오는 로직을 유지할 것.


## 5. TODO
- 좀 더 필요한 점 & 개선 제안 (Improvements)
- 사용자 경험 (UX/UI) 측면
    - 실시간 로그 스트리밍: 현재 구조에서는 배포가 실패했을 때 사용자가 이유를 알기 어렵습니다. CodeBuild의 로그나 EC2 내의 애플리케이션 로그를 프론트엔드에서 볼 수 있는 'Log Viewer' 기능이 있으면 훨씬 강력해질 것입니다.
    - 접속 정보 자동 안내: EC2가 실행된 후 사용자가 해당 서버에 바로 접속할 수 있도록 Public DNS 주소나 SSH 접속 명령어를 대시보드에서 바로 복사할 수 있게 제공해야 합니다.
- 인프라 및 운영 측면
    - 상태 동기화 이슈 (Race Condition): CloudFormation 스택이 생성 중일 때 사용자가 중복으로 '배포' 버튼을 누를 수 있습니다. 이를 방지하기 위해 상태 기반 버튼 활성화/비활성화 로직이 프론트와 백엔드 모두에 엄격하게 적용되어야 합니다.
    - 리소스 정리 (Cleanup): 브랜치가 삭제될 때 Webhook으로 환경을 지우는 로직은 훌륭하지만, 간혹 Webhook이 누락될 수 있습니다. 주기적으로 DynamoDB와 실제 AWS 리소스를 비교하여 '유령 리소스'를 삭제하는 Garbage Collector Lambda가 있으면 비용을 더 아낄 수 있습니다.
    - IAM Role의 세밀함: L_Main Lambda가 CloudFormation을 다룰 때, 생성하는 리소스에 대한 권한만 가질 수 있도록 Scoped IAM Policy를 적용했는지 점검해 보세요.
- 기능 확장 제안
    - 인스턴스 타입 선택: 프로젝트나 브랜치의 용도에 따라 t3.micro 외에 다른 사양을 선택할 수 있는 옵션이 있으면 좋겠습니다.
    - 기본 환경 템플릿: EC2가 뜰 때 Docker가 설치되어 있거나, 특정 DB가 미리 세팅되도록 UserData(Cloud-init) 설정을 커스터마이징할 수 있는 기능을 추가해 보세요.
