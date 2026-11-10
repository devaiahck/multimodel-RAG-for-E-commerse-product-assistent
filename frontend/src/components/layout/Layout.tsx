import { Outlet } from 'react-router-dom'
import AnnouncementBar from './AnnouncementBar'
import Header from './Header'
import Footer from './Footer'
import Toast from '../ui/Toast'
import CompareBar from '../compare/CompareBar'
import AssistantChatDrawer from '../assistant/AssistantChatDrawer'

export default function Layout() {
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <AnnouncementBar />
      <Header />
      <main id="main-content">
        <Outlet />
      </main>
      <Footer />
      <Toast />
      <CompareBar />
      <AssistantChatDrawer />
    </>
  )
}
