import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Header from './components/Layout/Header';
import { LoadingState, Page } from './components/Page';

const HomePage = lazy(() => import('./pages/HomePage'));
const LoginPage = lazy(() => import('./pages/LoginPage'));
const SignupPage = lazy(() => import('./pages/SignupPage'));
const TheatresPage = lazy(() => import('./pages/TheatresPage'));
const TheatreDetailPage = lazy(() => import('./pages/TheatreDetailPage'));
const AgendaPage = lazy(() => import('./pages/AgendaPage'));
const PerformanceDetailPage = lazy(() => import('./pages/PerformanceDetailPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const EditProfilePage = lazy(() => import('./pages/EditProfilePage'));
const FeedPage = lazy(() => import('./pages/FeedPage'));
const FriendRequestsPage = lazy(() => import('./pages/FriendRequestsPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));

const routeFallback = (
  <Page>
    <LoadingState />
  </Page>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <Header />
        <Suspense fallback={routeFallback}>
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
        </Suspense>
      </Router>
    </AuthProvider>
  );
}

export default App;
