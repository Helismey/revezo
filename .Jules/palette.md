## 2026-10-20 - Missing ARIA labels on read-only inputs
**Learning:** Even read-only inputs used for displaying values (like links) need ARIA labels for screen readers to announce their purpose.
**Action:** Always check inputs, not just buttons, for accessible labels.

## 2026-10-21 - ARIA labels for modal close buttons
**Learning:** Icon-only modal close buttons often lack accessible names, breaking WCAG standards for screen readers.
**Action:** Ensure all close buttons (`<button><X size={...} /></button>`) across modals and overlays have `aria-label="Fechar"`.
