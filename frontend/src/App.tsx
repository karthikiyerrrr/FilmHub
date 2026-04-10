import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SignInForm } from './components/SignInForm'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInForm />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div className="p-8 text-primary">Dashboard (TODO)</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/review/:videoId"
          element={
            <ProtectedRoute>
              <div className="p-8 text-primary">Review (TODO)</div>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
