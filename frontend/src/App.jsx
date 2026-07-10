import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import TopNav from './components/TopNav'
import Create from './pages/Create'
import Explore from './pages/Explore'
import NotFound from './pages/NotFound'
import TimerDetail from './pages/TimerDetail'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <div className="flex min-h-screen flex-col">
      <ScrollToTop />
      <TopNav />
      <Routes>
        <Route path="/" element={<Explore />} />
        <Route path="/t/:slug" element={<TimerDetail />} />
        <Route path="/create" element={<Create />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  )
}
