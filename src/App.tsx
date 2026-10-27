import { Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/ui'
import { TOOLS } from './tools'
import { About, Home, NotFound, Privacy } from './pages/Static'

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="loading">Loading…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            {TOOLS.map((t) => (
              <Route key={t.path} path={t.path} element={<t.component />} />
            ))}
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/about" element={<About />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}
