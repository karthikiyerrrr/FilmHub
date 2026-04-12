import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { SignInForm } from './components/SignInForm'
import { VideoPicker } from './components/VideoPicker'
import { ReviewView } from './components/ReviewView'

function ReviewPage() {
  const { videoId } = useParams<{ videoId: string }>()
  if (!videoId) return <Navigate to="/dashboard" replace />
  return <ReviewView videoId={videoId} />
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/sign-in" element={<SignInForm />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <VideoPicker />
            </ProtectedRoute>
          }
        />
        <Route
          path="/review/:videoId"
          element={
            <ProtectedRoute>
              <ReviewPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
