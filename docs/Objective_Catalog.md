# NewChums Objective Catalog

Generated from codebase analysis. This catalog covers implemented objectives and suggested future objectives for review.

---

## Implemented Objectives (v1, Next Best Step)

These are defined in `api/src/objectives.ts` and live in the system today.
Listed in their current sequence order.

### 1. add_display_name (sequence 10)

| Field | Value |
|-------|-------|
| **Title** | Add your name |
| **Category** | profile |
| **Description** | Let people know who you are by adding your display name. |
| **Completion trigger** | `users.name` is not null or empty |
| **Suited for** | Onboarding |
| **Notes** | Username is set during onboarding; display name is often left blank. This nudges users to add a real name for social trust. |

### 2. add_hobbies (sequence 20)

| Field | Value |
|-------|-------|
| **Title** | Add your hobbies |
| **Category** | profile |
| **Description** | Tell NewChums what you enjoy so we can show you relevant plans. |
| **Completion trigger** | At least one row in `user_interests` for the user |
| **Suited for** | Onboarding |
| **Notes** | Hobbies drive the personalized Explore feed ranking. Without them, recommendations are generic. Prioritized early because it directly affects plan discovery quality. |

### 3. set_location (sequence 30)

| Field | Value |
|-------|-------|
| **Title** | Set your location |
| **Category** | profile |
| **Description** | Help us find plans near you by setting your home area. |
| **Completion trigger** | `user_profile.home_lat/home_lng` are set, or `home_city` is not empty |
| **Suited for** | Onboarding |
| **Notes** | Location enables distance-based plan filtering and future proximity features. Placed right after hobbies as the other key discovery setup step. |

### 4. set_travel_distance (sequence 40)

| Field | Value |
|-------|-------|
| **Title** | Set your travel distance |
| **Category** | profile |
| **Description** | Choose how far you're willing to travel so we recommend the right plans. |
| **Completion trigger** | `user_profile.travel_radius_km` is not null and differs from the default of 200 |
| **Suited for** | Onboarding |
| **Notes** | The default is 200 km which is very broad. Users who intentionally set a distance get better-filtered results. Naturally follows location setup. |

### 5. add_bio (sequence 50)

| Field | Value |
|-------|-------|
| **Title** | Write a short bio |
| **Category** | profile |
| **Description** | A few words about yourself help others feel comfortable connecting. |
| **Completion trigger** | `user_profile.bio` is not null or empty |
| **Suited for** | Onboarding |
| **Notes** | Lower priority than hobbies/location but still helps social trust on public profile. |

### 6. add_avatar (sequence 60)

| Field | Value |
|-------|-------|
| **Title** | Add a profile picture |
| **Category** | profile |
| **Description** | A profile picture helps people recognize you at gatherings. |
| **Completion trigger** | `users.avatar_key` is not null |
| **Suited for** | Onboarding |
| **Notes** | Placed after discovery setup objectives because while helpful for trust, it doesn't affect plan recommendations. A profile picture requires more effort than text fields. |

### 7. join_first_plan (sequence 70)

| Field | Value |
|-------|-------|
| **Title** | Join your first plan |
| **Category** | plans |
| **Description** | Browse plans and RSVP to something that interests you. |
| **Completion trigger** | At least one `event_rsvps` row with `status = 'going'` |
| **Suited for** | Onboarding / early retention |
| **Notes** | Pivotal activation moment. Directs user to Explore feed. This is the transition from profile setup to real engagement. |

### 8. attend_first_plan (sequence 80)

| Field | Value |
|-------|-------|
| **Title** | Attend your first plan |
| **Category** | plans |
| **Description** | Show up to a plan you joined. That's what NewChums is all about. |
| **Completion trigger** | At least one past, non-canceled event where user RSVP'd 'going' and is not the host |
| **Suited for** | Retention |
| **Notes** | Depends on join_first_plan. Measures actual follow-through, not just intent. |

### 9. send_first_message (sequence 90)

| Field | Value |
|-------|-------|
| **Title** | Say hello in a plan chat |
| **Category** | engagement |
| **Description** | Introduce yourself in a plan's group chat before meeting up. |
| **Completion trigger** | At least one row in `event_chat_messages` for the user |
| **Suited for** | Retention |
| **Notes** | Encourages pre-event social interaction. Reduces no-show likelihood. |

### 10. give_first_feedback (sequence 100)

| Field | Value |
|-------|-------|
| **Title** | Give feedback after a plan |
| **Category** | engagement |
| **Description** | Quick feedback helps NewChums improve your future matches. |
| **Completion trigger** | At least one row in `plan_feedback` where `reviewer_user_id` matches |
| **Suited for** | Retention |
| **Notes** | Depends on attending a plan. Feeds the chum preferences / matching quality system. |

### 11. create_first_plan (sequence 110)

| Field | Value |
|-------|-------|
| **Title** | Create your first plan |
| **Category** | plans |
| **Description** | Organize a gathering around something you enjoy. |
| **Completion trigger** | At least one event where `host_user_id` matches and status is 'published' or 'canceled' |
| **Suited for** | Retention / power user |
| **Notes** | High-value action. Positioned late as it requires confidence and commitment. |

### 12. add_first_chum (sequence 120)

| Field | Value |
|-------|-------|
| **Title** | Add someone to Chums |
| **Category** | social |
| **Description** | Add someone to your Chums so you can plan together easily. |
| **Completion trigger** | At least one row in `user_contacts` for the user |
| **Suited for** | Retention |
| **Notes** | Moved to the end of the sequence because connections form most naturally after participating in plans. Nudging this too early feels premature when the user hasn't met anyone yet. |

---

## Sequence Design Notes

The implemented sequence follows a deliberate activation path:

1. **Identity** (add_display_name): Minimal effort, establishes who the user is.
2. **Discovery setup** (add_hobbies → set_location → set_travel_distance): These directly improve plan recommendations. Prioritized because they make the Explore feed useful.
3. **Profile depth** (add_bio → add_avatar): Improve social trust but don't affect plan matching. More effort than text fields, especially avatar upload.
4. **First activation** (join_first_plan → attend_first_plan): The core product loop. Joining is intent; attending is follow-through.
5. **Engagement deepening** (send_first_message → give_first_feedback): Build habits that improve community quality.
6. **Hosting** (create_first_plan): Highest-commitment action. Power user territory.
7. **Social graph** (add_first_chum): Connections form naturally after meeting people through plans.

---

## Suggested Future Objectives (Not Yet Implemented)

These are natural extensions that may be added later. They are categorized by suitability.

### Onboarding candidates (could be added to the active sequence)

| Key | Title | Category | Description | Trigger | Notes |
|-----|-------|----------|-------------|---------|-------|
| `set_chum_preferences` | Set your chum preferences | profile | Tell NewChums what matters to you in the people you meet. | `chum_preferences` row exists with `enabled = true` | Power-user feature. Valuable but could be overwhelming during onboarding. Consider adding as a later-sequence objective. |

### Retention / engagement candidates (repeatable or milestone-based)

| Key | Title | Category | Description | Trigger | Notes |
|-----|-------|----------|-------------|---------|-------|
| `attend_three_plans` | Attend 3 plans | plans | Build your follow-through record. | 3+ past attended plans | Repeatable milestone tier. |
| `host_three_plans` | Host 3 plans | plans | Become a reliable host. | 3+ past hosted plans | Repeatable milestone tier. |
| `give_five_feedbacks` | Give feedback 5 times | engagement | Help improve the community. | 5+ distinct plans with feedback | Repeatable milestone tier. |
| `invite_someone` | Invite a friend to NewChums | social | Bring someone new to the platform. | `chum_invites` row created | Growth-oriented; track via invite flow. |
| `add_five_chums` | Build your network (5 chums) | social | Save 5 people to your connections. | 5+ rows in `user_contacts` | Repeatable milestone tier. |

### Achievement / gamification candidates (future badge/XP system)

| Key | Title | Category | Description | Trigger | Notes |
|-----|-------|----------|-------------|---------|-------|
| `reach_preferred_reliability` | Reliable chum | trust | Achieve "Preferred" reliability status. | Reliability score >= 35 with signal_count >= 3 | Badge/achievement material. |
| `perfect_followthrough_5` | Perfect attendance (5 plans) | trust | Show up to 5 consecutive plans. | 5+ consecutive attended plans | Streak-based; requires tracking logic. |
| `first_positive_feedback` | Positive reception | trust | Receive your first "Yes" feedback. | Feedback row where response = 'yes' for reported user | Passive achievement. |
| `set_profile_theme` | Customize your profile color | profile | Choose a theme color for your profile card. | `users.profile_theme` is not null | Low-value for nudge; better as cosmetic achievement. |
| `confirm_attendance` | Confirm your attendance | engagement | Respond to a pre-plan check-in. | `event_confirmations` row with status 'confirmed' | Attendance assurance feature. |
| `receive_first_chum` | Someone added you | social | Another person saved you as a connection. | `user_contacts` row where `linked_user_id` matches | Passive; works better as notification/achievement. |

### Considered and intentionally excluded from v1

| Key | Reason for exclusion |
|-----|---------------------|
| `respond_to_invite` | Depends on receiving an invite; cannot be reliably prompted. Better as a passive achievement. |
| `suggest_better_time` | Very contextual action; depends on specific plan timing. Not a meaningful milestone. |
| `open_plan_details` | Page views are not tracked in the database. Would require new tracking infrastructure. |
| `set_gender` | Sensitive personal information. Should not be nudged. |
| `report_attendance_issue` | Sensitive moderation action. Should never be incentivized or nudged. |

---

## Categories

| Category | Purpose | Implemented count | Notes |
|----------|---------|-------------------|-------|
| `profile` | Complete profile for discovery + trust | 6 | Core onboarding |
| `plans` | Engage with the core product loop | 3 | Activation + retention |
| `social` | Build connections on the platform | 1 | Network effects |
| `engagement` | Deepen platform participation | 2 | Retention + community health |
| `trust` (future) | Reputation milestones | 0 | Future gamification layer |

---

## Extensibility Notes

- New objectives: append to `OBJECTIVES` array in `api/src/objectives.ts` (sequence numbers use gaps of 10).
- `ObjectiveDefinition` type can be extended with `xp`, `badge`, `tier`, `repeatable` fields for future gamification.
- Per-objective completion records in `user_objective_completions` support time-based analytics and reward triggers.
- The `category` field enables future category-based UI grouping.
- Admin KPI funnel automatically includes any new objectives added to the catalog.
