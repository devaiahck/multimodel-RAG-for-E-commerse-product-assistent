import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import Layout from './components/layout/Layout'
import { useAuthStore } from './store/auth'

// Lazy-loaded pages for route-level code splitting
const Splash = lazy(() => import('./pages/Splash'))
const Home = lazy(() => import('./pages/Home'))
const Login = lazy(() => import('./pages/Login'))
const Signup = lazy(() => import('./pages/Signup'))
const NotFound = lazy(() => import('./pages/NotFound'))
const Search = lazy(() => import('./pages/Search'))
const Category = lazy(() => import('./pages/Category'))
const Cart = lazy(() => import('./pages/Cart'))
const Product = lazy(() => import('./pages/Product'))
const Compare = lazy(() => import('./pages/Compare'))
const Budget = lazy(() => import('./pages/Budget'))
const Account = lazy(() => import('./pages/Account'))

/** Show splash once per session, then redirect to home */
function RootRedirect() {
  const splashDone = sessionStorage.getItem('splash_done')
  if (!splashDone) {
    return <Navigate to="/__splash" replace />
  }
  return <Home />
}

function App() {
  useEffect(() => {
    useAuthStore.getState().checkAuth()
  }, [])

  return (
    <Suspense fallback={null}>
      <Routes>
        {/* Splash is standalone, no layout */}
        <Route path="/__splash" element={<Splash />} />
        {/* Login / signup standalone (dark full-page) */}
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        {/* Main layout */}
        <Route element={<Layout />}>
          <Route path="/" element={<RootRedirect />} />
          <Route path="/search" element={<Search />} />
          <Route path="/category/:slug" element={<Category />} />
          <Route path="/product/:id" element={<Product />} />
          <Route path="/compare" element={<Compare />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/account" element={<Account />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

export default App
