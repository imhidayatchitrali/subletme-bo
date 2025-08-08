# SubletMe Project

This project consists of two main components: a backend API service (`subletme_bo`) and a mobile application (`subletme_mobile`).

## Project Structure
```
subletme/
├── subletme_bo/        # Backend API service
└── subletme_mobile/    # Flutter mobile application
```

## Backend Service (subletme_bo)

### Tech Stack
- Node.js with TypeScript
- PostgreSQL Database
- Express.js Framework
- Docker & Docker Compose
- RESTful API Architecture

### Getting Started
1. Clone the repository
```bash
git clone git@github.com:miapansky/subletme.git
cd subletme/subletme_bo
```

2. Environment Setup
```bash
cp .env.example .env
# Edit .env file with your configurations
```

3. Run the Service
```bash
# Start all services
make start

# Stop all services
make stop
```

### API Documentation
The API is available at `http://localhost:8080/api/` when the service is running.

### Database Schema
- Users

## Mobile Application (subletme_mobile)

### Tech Stack
- Flutter
- Riverpod for state management
- Go Router for navigation
- Dio for API communication

### Features
- Google Sign-In Authentication
- User Profile

### Getting Started
1. Navigate to mobile project
```bash
cd subletme/subletme_mobile
```

2. Install dependencies
```bash
flutter pub get
```

3. Run the app
```bash
flutter run
```

### Environment Configuration
Create a `assets/environment/local.env` file in the `subletme_mobile` directory:
```env
API_BASE_URL=http://localhost:8080/api
GOOGLE_CLIENT_ID=your-google-client-id
```

## Development
- Backend: `http://localhost:8080/api`
- Mobile: Runs on Android/iOS devices or emulators

## Mobile Localization
- Run: `flutter pub run intl_generator:generate_from_arb --output-dir=lib/l10n --no-use-deferred-loading lib/l10n/app_localizations.dart lib/l10n/*.arb`

## Credentials

- Check Certificate fingerprint (SHA1): `./gradlew app:signingReport`

## License
SubletMe
