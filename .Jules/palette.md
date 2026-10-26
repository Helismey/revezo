## 2026-10-20 - Missing ARIA labels on read-only inputs
**Learning:** Even read-only inputs used for displaying values (like links) need ARIA labels for screen readers to announce their purpose.
**Action:** Always check inputs, not just buttons, for accessible labels.

## 2026-10-21 - ARIA labels for modal close buttons
**Learning:** Icon-only modal close buttons often lack accessible names, breaking WCAG standards for screen readers.
**Action:** Ensure all close buttons (`<button><X size={...} /></button>`) across modals and overlays have `aria-label="Fechar"`.
## 2025-02-12 - AlertBanner Accessibility
**Learning:** Adding `aria-live` to notification banners improves accessibility by ensuring screen readers announce dynamic updates (like success or error messages) reliably without requiring the component to receive focus.
**Action:** Use `aria-live="polite"` for non-critical updates and `aria-live="assertive"` for critical errors on status message containers.
## 2025-02-12 - ARIA-pressed for toggle buttons
**Learning:** For toggle buttons that represent a state (like selecting between "current" or "all"), using `aria-pressed` or grouping them with `role="group"` and `aria-labelledby` ensures screen readers can announce the current state accurately, rather than relying solely on visual CSS changes.
**Action:** Use `role="group"`, `aria-labelledby`, and `aria-pressed` for custom toggle button groups.
## 2024-10-24 - Accessible Modal and ConfirmDialog enhancements
**Learning:** Adding explicit programmatic links between `<label>` and `<input>` using `useId()` and explicit `focus-visible` styles on buttons drastically improves accessibility for keyboard and screen reader users within dialog components.
**Action:** Next time creating inputs or interactive modals, always use `useId()` for dynamic IDs to link inputs and labels, and include explicit `focus-visible` states (like `focus:outline-none focus-visible:ring-2`) for all interactive elements.
