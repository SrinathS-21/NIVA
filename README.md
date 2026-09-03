# NIVA: Notice, Insight, Value, Action
## Master Product Context, Architecture & Implementation Roadmap

> **Document Version:** 1.1  
> **Source Threads:**  
> 1. [ChatGPT Thread 1: Review Needle PRD Fit](file:///d:/Projects/NIVA%20-%20Notice%20Insight%20Value%20Action/Research/CHATGPT_TRANSCRIPT_1_REVIEW_PRD_FIT.md) (`https://chatgpt.com/share/6a8729ab-f014-83e8-b166-8cc4a36d94f7`)  
> 2. [ChatGPT Thread 2: Needle BitNet Product Ideas](file:///d:/Projects/NIVA%20-%20Notice%20Insight%20Value%20Action/Research/CHATGPT_TRANSCRIPT_2_NEEDLE_BITNET_IDEAS.md) (`https://chatgpt.com/share/6a8729d6-6650-83e8-ade0-4839dabd476e`)  
> **Core Architecture & Design Specs:**  
> - [NIVA Design System & UI/UX Spec (Unistyles v2 Primary • NativeWind v4 Alternative)](file:///d:/Projects/NIVA%20-%20Notice%20Insight%20Value%20Action/Research/NIVA_DESIGN_SYSTEM_AND_UI_SPEC.md)  
> - [NIVA V1 Architecture & Tech Spec (Expo + Kotlin + SQLite)](file:///d:/Projects/NIVA%20-%20Notice%20Insight%20Value%20Action/Research/NIVA_V1_ARCHITECTURE_AND_TECH_SPEC.md)  
> - [PRD Needle V1/V2 Revised](file:///d:/Projects/NIVA%20-%20Notice%20Insight%20Value%20Action/Research/PRD_Needle_V1_V2_Revised.md)  
> - [PRD Action Inbox V1/V2](file:///d:/Projects/NIVA%20-%20Notice%20Insight%20Value%20Action/Research/PRD_Action_Inbox_V1_V2.md)

---

## 1. Executive Summary & Product Vision

### 1.1 What is NIVA?
**NIVA (Notice • Insight • Value • Action)** is an **on-device personal intelligence control center and action layer**. 
Unlike passive notification organizers or heavyweight cloud LLM chatbots, NIVA uses specialized, ultra-compact on-device models (specifically **Cactus Compute Needle**) combined with robust deterministic parsing and an extensible integrations engine to turn messy daily communications (SMS, notifications, emails, alerts) into structured knowledge and automated real-world actions.

```
       ┌────────────────────────────────────────────────────────┐
       │                   THE NIVA LIFECYCLE                   │
       └────────────────────────────────────────────────────────┘
  
  [ NOTICE ]  ──►  [ INSIGHT ]  ──►   [ VALUE ]   ──►  [ ACTION ]
  • Notifications  • Pre-processing    • 5 App Tabs   • 1-Click Execution
  • SMS / Emails   • Needle Routing    • Insights &   • Sync to Notion /
  • App Events     • Post-validation     Summaries      Calendar / Sheets
  • Local / Safe   • Tool Calling      • Local DB     • Automation Rules
```

### 1.2 Key Paradigm Shifts from Discussions
1. **Not Just an "Action Inbox", but a "Central Control Center":**
   The initial design was framed narrowly as a passive "Action Inbox". The refined architecture positions NIVA as the user's **central tracking dashboard** where events across life (money, bills, deliveries, trips, tasks) are categorized, visualized, analyzed, and optionally synced to external tools.
2. **On-Device First for Privacy & Zero Latency:**
   Personal financial SMS, transit bookings, delivery OTPs, and health notifications remain strictly on-device. No sensitive private texts are leaked to cloud LLMs.
3. **Hybrid Architecture Over Pure LLM:**
   Experiments with Needle demonstrated that while the model excels at high-level tool classification and intent routing, small models can struggle with raw entity extraction (e.g. `₹2,499` parsed as `2.499` float). NIVA solves this through a **Hybrid Parsing Pipeline**:
   - **Deterministic Pre-processor** (Regex cleaning, currency/number normalization)
   - **Needle Semantic Router** (Tool selection & parameter mapping)
   - **Schema Validator & Post-processor** (Pydantic / Zod type coercion & confidence thresholding)
   - **Action & Sync Engine** (Local storage + external tool dispatch)

---

## 2. Core Product Architecture: The 5 Sections

NIVA organizes all tracked life events into **5 dedicated pillars/sections**:

```
 ┌───────────────────────────────────────────────────────────────────────────┐
 │                       NIVA CONTROL CENTER SECTIONS                        │
 ├─────────────┬─────────────┬─────────────┬─────────────┬───────────────────┤
 │  1. FINANCE │  2. BILLS   │ 3. LOGISTICS│  4. TRANSIT │ 5. HEALTH & TASKS │
 │  & EXPENSES │ & UTILITIES │ & DELIVERIES│  & TRAVEL   │  & SMART ALERTS   │
 ├─────────────┼─────────────┼─────────────┼─────────────┼───────────────────┤
 │ • Debits    │ • Dues      │ • Amazon    │ • Flights   │ • Appointments    │
 │ • Credits   │ • Due Dates │ • Swiggy/Zom│ • Trains    │ • OTPs / Security │
 │ • Salary    │ • Overdues  │ • Couriers  │ • Cabs      │ • Reminders       │
 │ • Analytics │ • Pay Links │ • OTP Popup │ • Boarding  │ • System Notices  │
 └─────────────┴─────────────┴─────────────┴─────────────┴───────────────────┘
```

### Section 1: Finance (Expenses, Income & Subscriptions)
- **Functions / Tools:** `create_expense`, `create_income`, `track_subscription`, `update_account_balance`
- **Core Entities:** `amount`, `currency`, `merchant_or_source`, `category` (Food, Shopping, Utilities, Salary, Transfer), `account_tail` (e.g., "XX1234"), `timestamp`.
- **Value Created:** Automatic monthly spend tracking, instant category breakdown, anomaly alerts, export to Google Sheets / Notion / Splitwise.

### Section 2: Bills, Utilities & Payments
- **Functions / Tools:** `create_bill_reminder`, `mark_bill_paid`, `track_due_date`
- **Core Entities:** `bill_type` (Electricity, Water, Credit Card, Broadband, Rent), `amount_due`, `due_date`, `biller_name`, `payment_link`, `status` (Upcoming, Overdue, Paid).
- **Value Created:** Prevents late fees with countdown timers, 1-click payment triggers, auto-reconciliation when confirmation SMS is received.

### Section 3: Deliveries, Orders & Logistics
- **Functions / Tools:** `track_delivery`, `update_delivery_status`, `surface_delivery_otp`
- **Core Entities:** `service_provider` (Amazon, Flipkart, Bluedart, Swiggy, Zomato), `tracking_id`, `status` (Dispatched, Out for Delivery, Delivered), `otp_code`, `estimated_arrival`.
- **Value Created:** Heads-up delivery notifications, floating/quick-copy OTP widget on delivery day, return window expiry tracker.

### Section 4: Transit, Travel & Bookings
- **Functions / Tools:** `create_travel_booking`, `track_pnr_status`, `update_ride_status`
- **Core Entities:** `transport_type` (Flight, Train/IRCTC, Bus, Cab/Uber/Ola), `departure_time`, `arrival_time`, `origin`, `destination`, `pnr_or_booking_id`, `seat_gate_info`.
- **Value Created:** Automatic calendar synchronization, trip itinerary builder, live PNR/flight delay tracking, driver details & cab PIN surfacing.

### Section 5: Health, Tasks, Personal & Smart Alerts
- **Functions / Tools:** `create_task_reminder`, `store_security_otp`, `log_health_event`
- **Core Entities:** `title`, `deadline_or_time`, `urgency`, `otp_code`, `expiry_duration`, `tags`.
- **Value Created:** Auto-expiring sensitive OTPs (auto-deleted after 10 mins for privacy), smart actionable reminders, appointment logs.

---

## 3. Technology & Intelligence Stack

### 3.1 On-Device Model: Cactus Compute Needle
- **Model Role:** Fast (~10-50ms), compact (26M parameters) function calling agent.
- **Model Inputs:** Incoming parsed event text + JSON schema of domain tools.
- **Model Output:** `function_name`, extracted `arguments`, `reasoning`, `confidence`.
- **Deployment Runtime:** 
  - Mobile (Android / iOS): ONNX Runtime Mobile / Llama.cpp / Cactus Native SDK.
  - Desktop / Server (Windows / Mac / Linux): Python runtime via `cactus` package or ONNX Runtime CPU/GPU.

### 3.2 Hybrid Processing Pipeline (Engineering Best Practice)

```
 Raw Notification / SMS / Event
              │
              ▼
 ┌─────────────────────────────┐
 │  Step 1: Text Pre-Processor │  • Strip boilerplate & masking (XX9081)
 │    (Regex & Normalization)  │  • Normalize commas in numbers (2,499 -> 2499)
 └──────────────┬──────────────┘  • Normalize currency symbols (₹, $, Rs)
                │
                ▼
 ┌─────────────────────────────┐
 │  Step 2: Needle Tool Router │  • Selects target tool from the 5 sections
 │     (On-Device Model)       │  • Performs semantic parameter extraction
 └──────────────┬──────────────┘
                │
                ▼
 ┌─────────────────────────────┐
 │ Step 3: Schema Post-Val     │  • Pydantic / Zod validation
 │   & Confidence Gating       │  • Fallback to rule-engine if confidence < 0.70
 └──────────────┬──────────────┘
                │
                ▼
 ┌─────────────────────────────┐
 │ Step 4: Storage & Actions   │  • Store in Local SQLite DB
 │   (Local DB & Integrations) │  • Trigger UI update & 1-Click Action Hub
 └─────────────────────────────┘  • Sync to external tools (Google, Notion, etc.)
```

---

## 4. Integration Ecosystem

NIVA connects local event tracking with external productivity systems:

| Service | Integration Type | Use Case |
| :--- | :--- | :--- |
| **Google Calendar** | Google OAuth API | Automatically add flights, bill due dates, and doctor appointments |
| **Notion** | Notion REST API | Sync daily expenses and delivery history to user's personal databases |
| **Google Sheets** | Sheets API / CSV Export | Live streaming financial transaction log for monthly budgeting |
| **Todoist / Reminders** | REST API / System Intents | Create urgent tasks for action items |
| **Splitwise** | Splitwise API | 1-Click split expense with roommates or group |
| **Webhooks** | Custom HTTP POST | Connect to Zapier, n8n, Make, or local home automation |

---

## 5. Technical Implementation Roadmap

### Phase 1: Engine Foundation & Parser Suite
- [x] Gather all conversation context, PRDs, schemas, and architecture requirements.
- [ ] Implement `niva-core` engine in Python/TypeScript:
  - Text Normalization & Pre-processor module.
  - Needle-2 Function Calling wrapper with fallback parser.
  - Pydantic models for all 5 sections.
  - Test matrix with real-world Indian & international SMS/notification samples.

### Phase 2: Local Database & Event Store
- [ ] Implement SQLite schema with SQLite-Vec / full-text search.
- [ ] Event deduplication and entity resolution (matching payment receipt with original bill reminder).
- [ ] Auto-expiry manager for sensitive OTPs.

### Phase 3: Desktop / Web Control Center Application
- [ ] Modern, high-aesthetic Web & Desktop Dashboard:
  - **Overview Dashboard**: Unified timeline, spend metrics, pending bills, active deliveries, upcoming trips.
  - **5 Dedicated Tab Views**: Finance, Bills, Logistics, Transit, Tasks/Alerts.
  - **Interactive Playground / Simulator**: Test live SMS/notification inputs against the parser and inspect tool selection.
  - **Integrations Hub**: Configure OAuth tokens, webhooks, and sync toggles.
  - **Settings & Privacy**: Manage local data, export backups, wipe data.

### Phase 4: Mobile & Background Listeners
- [ ] Android Notification Listener Service integration.
- [ ] Desktop Notification / Clipboard / Webhook listener.
- [ ] End-to-end sync and 1-click action triggers.

---

## 6. Directory Structure Overview

```
NIVA - Notice Insight Value Action/
├── Research/
│   ├── CHATGPT_TRANSCRIPT_1_REVIEW_PRD_FIT.md       # Raw chat 1 transcript
│   ├── CHATGPT_TRANSCRIPT_2_NEEDLE_BITNET_IDEAS.md    # Raw chat 2 transcript
│   ├── PRD_Needle_V1_V2_Revised.md                  # Detailed revised PRD
│   ├── PRD_Action_Inbox_V1_V2.md                    # Original Action Inbox PRD
│   └── MASTER_PRODUCT_CONTEXT_AND_ROADMAP.md        # This master document
├── src/                                             # Application source code
│   ├── core/                                        # Parser & Needle runtime
│   ├── db/                                          # SQLite storage & models
│   ├── integrations/                                # Calendar, Notion, Sheets
│   └── ui/                                          # Web / Desktop App UI
└── README.md
```
