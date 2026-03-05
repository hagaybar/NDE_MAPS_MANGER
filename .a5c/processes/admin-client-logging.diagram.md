# Admin Client-Side Logging - Process Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     ADMIN CLIENT LOGGING PROCESS                             │
│                                                                              │
│  Goal: Add comprehensive logging to debug "Failed to fetch" errors          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: Create Logging Service                                              │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Create: admin/services/logger.js                                     │   │
│  │                                                                       │   │
│  │  Features:                                                            │   │
│  │  • Log levels (debug, info, warn, error)                              │   │
│  │  • Circular buffer (500 entries max)                                  │   │
│  │  • Structured log entries with timestamps                             │   │
│  │  • API call wrapper with timing                                       │   │
│  │  • Error boundary (window.onerror)                                    │   │
│  │  • Export logs as JSON                                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: Integrate API Logging                                               │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Modify: admin/components/errors-dashboard.js                         │   │
│  │                                                                       │   │
│  │  Add logging to:                                                      │   │
│  │  • loadCSVData() - log fetch start/success/error                      │   │
│  │  • saveRow() - detailed request/response logging                      │   │
│  │  • handleFixClick() - user action logging                             │   │
│  │  • All catch blocks - error details                                   │   │
│  │                                                                       │   │
│  │  Key improvement: Capture "Failed to fetch" with context              │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: Create Debug Console UI                                             │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Create: admin/components/debug-console.js                            │   │
│  │                                                                       │   │
│  │  Features:                                                            │   │
│  │  • Floating panel (bottom-right)                                      │   │
│  │  • Toggle with Ctrl+Shift+D                                           │   │
│  │  • Real-time log display                                              │   │
│  │  • Filter by level/category                                           │   │
│  │  • Search logs                                                        │   │
│  │  • Export button                                                      │   │
│  │  • Color-coded entries                                                │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 4: Integrate into App                                                  │
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Modify: admin/app.js                                                 │   │
│  │                                                                       │   │
│  │  Changes:                                                             │   │
│  │  • Import logger and debug console                                    │   │
│  │  • Initialize in init()                                               │   │
│  │  • Set up global error handlers                                       │   │
│  │  • Add window.__logger for console access                             │   │
│  │  • Log view changes and auth events                                   │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ BREAKPOINT: Review Implementation                                            │
│                                                                              │
│  • Verify all files created correctly                                        │
│  • Test debug console toggle                                                 │
│  • Confirm API logging captures the error                                    │
└─────────────────────────────────────────────────────────────────────────────┘

## Expected Outcome

After this process completes:
1. You can press Ctrl+Shift+D to open the debug console
2. All API calls are logged with timing and response details
3. The "Failed to fetch" error will be logged with:
   - Request URL and method
   - Request headers and body
   - Error type and message
   - Network status
4. You can export logs as JSON for sharing/analysis
5. window.__logger available for console debugging
