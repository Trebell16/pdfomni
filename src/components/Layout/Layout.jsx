import { useLocation } from 'react-router-dom'
import Header from './Header'
import Footer from './Footer'
import ToastContainer from '../Common/ToastContainer'
import ChatSidebar from '../AI/ChatSidebar'

export default function Layout({ children }) {
  const location = useLocation()
  const isEditPage = ['/tool/edit', '/tool/draw', '/tool/image-edit', '/edit-pdf'].includes(location.pathname)

  if (isEditPage) {
    return (
      <>
        <main style={{ flex: 1, height: '100vh', width: '100vw', margin: 0, padding: 0, overflow: 'hidden' }}>
          {children}
        </main>
        <ToastContainer />
        <ChatSidebar />
      </>
    )
  }

  return (
    <>
      <Header />
      <main style={{ flex: 1, paddingTop: 'var(--header-height)' }}>
        {children}
      </main>
      <Footer />
      <ToastContainer />
      <ChatSidebar />
    </>
  )
}
