## 2026-11-01 - [ActionSubmitButton Spinner]
**Learning:** Adding a generic spinner to a shared button component (`ActionSubmitButton`) gives a global UX improvement across the entire app with a tiny local change. Setting `aria-hidden="true"` on loading icons is crucial so screen readers do not double-announce it along with `pendingText`.
**Action:** Always verify if a UX improvement can be centralized in a shared component for wider impact, and always add `aria-hidden="true"` to decorative/redundant loading icons.
