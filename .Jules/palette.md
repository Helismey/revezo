## 2024-11-02 - ActionSubmitButton Missing Visual Feedback for Async Actions
**Learning:** ActionSubmitButton correctly utilized React's `useFormStatus` to handle pending states and prevent duplicate clicks, but lacked an overt visual indicator of the background process, which could leave users uncertain whether their action was registered, especially on slower network connections.
**Action:** Adding an inline-flex `CircleNotch` spinner alongside the pending text provides immediate confidence and is a reusable pattern that should be applied to any asynchronous action buttons going forward.
