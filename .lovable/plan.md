

## Add "Back" button to presentation

Add a back navigation button (top-left corner) to return to the main page from the presentation.

### Changes in `src/pages/PlatformPresentation.tsx`

1. Import `useNavigate` from `react-router-dom` and `ArrowLeft` from `lucide-react`
2. Add `const navigate = useNavigate()` in the component
3. Add a fixed top-left button with `ArrowLeft` icon that calls `navigate("/")` — styled consistently with the bottom nav (semi-transparent dark pill with white icon), e.g.:

```tsx
<button onClick={() => navigate("/")}
  className="fixed top-6 left-6 z-50 p-3 rounded-full bg-black/60 backdrop-blur-md hover:bg-white/10 transition-colors text-white">
  <ArrowLeft className="w-5 h-5" />
</button>
```

