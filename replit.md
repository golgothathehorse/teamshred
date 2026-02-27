# Team Shred v3

## Overview
Team Shred v3 is a team-based weight tracking and competition application designed to help users log their weight and body fat, track individual progress, and compete within teams. Its purpose is to create an engaging and motivating platform for fitness journeys through features like multi-team support, BMR/TDEE calculation, personal journaling, and a comprehensive competitive challenge system ("Warzone"). The project aims to provide a robust and enjoyable experience for users focused on their fitness goals.

## User Preferences
- I prefer clear and concise explanations.
- I appreciate an iterative development approach, where changes are introduced gradually.
- Please ask for confirmation before implementing major architectural changes or refactoring large portions of the codebase.
- Ensure that all date formats are consistently DD/MM/YYYY throughout the application for Australian users.
- Prioritize mobile-first design and responsive layouts.

## System Architecture
### UI/UX Decisions
The application utilizes `shadcn/ui` for standardized components and adopts a mobile-first, responsive design. Color schemes are intentionally distinct for different features to enhance user experience. Custom components are used for specific data visualizations, and tooltips are optimized for mobile interaction.

### Technical Implementations
The project is built with Next.js 16.0.3 (Pages Router), TypeScript 5.9.3, and Tailwind CSS 3.4.18. Authentication is handled via JWT sessions. Usernames are case-insensitive for login but preserve capitalization for display. Date handling is localized to prevent timezone issues, ensuring a consistent DD/MM/YYYY format. Both client-side and backend data validation are implemented. The database is Replit PostgreSQL with Drizzle ORM.

**Core Features:**
- **BMR & TDEE Calculation**: Implemented using the Mifflin-St Jeor formula, with activity-based TDEE and fat-loss targets. Shredulator settings are persistent in browser localStorage.
- **Multi-Team Architecture**: Supports users belonging to and switching between multiple teams. All team-related operations include membership validation.
- **Individual Dashboard**: Provides personal statistics, unified logging, a BMR calculator, Shred Tracker charts, a weight history table, goal management, password reset, and a Team Switcher.
- **Journal Feature**: A personal notes section with categorized entries and an option for team members to view.
- **Team Page**: Displays team news, member statistics, multi-user charts, and a summary table with performance tracking.
- **Admin Control Room**: A "nox"-only interface for user and team management.
- **Performance Tracking**: Automated banners for weekly and weekend weight loss performance.
- **Warzone (Competitive Challenges)**: A comprehensive system for various challenge types:
    - **Shred Off**: 1v1 weight-loss competitions.
    - **Onslaught**: Rep-based challenges for individuals, 1v1, and teams, featuring leaderboards and bar chart visualizations. Includes `Lone Wolf`, `Showdown`, and `Team Blitzkrieg` modes.
    - **The Apollo (Tracker)**: A mobile-first activity logging page allowing retrospective logging and "Flaps Logging" for cardio/HIIT. Entries can be shared with team members.
    - **Sesh (Gym Workouts)**: Features custom exercise creation (only name required, other fields optional with "To be added" display), exercise editing (creator-only), set-level notes/comments with info icon popups across all history views, and shared exercise catalogue.
    - **Sesh Challenges**: Gym session-based challenges (1v1, team, solo) that auto-log completed sessions.
    - **Shared Workout History**: A section displaying team members' shared workout data with filtering options.
    - **Challenge Visualizations**: Progress bars and bar charts for challenge progress.
- **Challenge Management**: Functionality for admins or creators to delete challenges and for participants to surrender. Admin-only comprehensive challenge editing via `ChallengeEditModal` component supporting all challenge types (Showdown, Lone Wolf, Blitzkrieg, Sesh, Flaps, Shred Off) with field editing (title, dates, stakes, description, targets), task/leg target modifications, and entry viewing/editing/deleting. Accessible from challenge cards on the Warzone page and challenge detail pages.

### System Design Choices
The project maintains a structured directory layout (`pages`, `components`, `lib`, etc.). API routes are organized by data entities. ESLint is configured for code quality. The system enforces a strict separation between development and production databases. Production data fixes follow a specific pattern involving authenticated API endpoints on the published site. Challenge display logic is carefully managed across multiple frontend and backend locations to ensure consistency. Date handling consistently uses the Sydney/Australia timezone and DD/MM/YYYY format for display.

## External Dependencies
- **Replit PostgreSQL**: The primary database service.
- **Drizzle ORM**: Used for type-safe database interactions.
- **Next.js**: The chosen React framework.
- **React**: For building user interfaces.
- **TypeScript**: Ensures type safety throughout the codebase.
- **Tailwind CSS**: For utility-first styling.
- **ESLint**: For maintaining code quality and consistency.
- **bcryptjs**: Used for secure password hashing.
- **jsonwebtoken**: For implementing JWT-based authentication.