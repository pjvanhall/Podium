import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Layout/Header';
import HomePage from './pages/HomePage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import TheatresPage from './pages/TheatresPage';
import TheatreDetailPage from './pages/TheatreDetailPage';
import AgendaPage from './pages/AgendaPage';
import PerformanceDetailPage from './pages/PerformanceDetailPage';
import ProfilePage from './pages/ProfilePage';
import EditProfilePage from './pages/EditProfilePage';
import FeedPage from './pages/FeedPage';
import FriendRequestsPage from './pages/FriendRequestsPage';
import SearchPage from './pages/SearchPage';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Header />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/registreren" element={<SignupPage />} />
          <Route path="/theaters" element={<TheatresPage />} />
          <Route path="/theater/:id" element={<TheatreDetailPage />} />
          <Route path="/agenda" element={<AgendaPage />} />
          <Route path="/voorstelling/:id" element={<PerformanceDetailPage />} />
          <Route path="/profiel/:id" element={<ProfilePage />} />
          <Route path="/profiel/:id/bewerken" element={<EditProfilePage />} />
          <Route path="/feed" element={<Navigate to="/vrienden" replace />} />
          <Route path="/vrienden" element={<FeedPage />} />
          <Route path="/vriendschapsverzoeken" element={<FriendRequestsPage />} />
          <Route path="/zoeken" element={<SearchPage />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
