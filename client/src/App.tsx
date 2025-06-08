import { Routes, Route } from 'react-router-dom'
import DashboardPage from './pages/Dashboard'
import NotFoundPage from './routes/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
