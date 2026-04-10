import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<div>Sign In (TODO)</div>} />
        <Route path="/dashboard" element={<div>Dashboard (TODO)</div>} />
        <Route path="/review/:videoId" element={<div>Review (TODO)</div>} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
