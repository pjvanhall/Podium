import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { connectionsApi } from '../../services/api';
import { Theater, Calendar, Users, Home, LogOut, Bell, User, Menu, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import './Header.css';

export default function Header() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);

  useEffect(() => {
    loadPendingRequestCount();
  }, [user, location.pathname]);

  useEffect(() => {
    function handleRequestsUpdated() {
      loadPendingRequestCount();
    }

    window.addEventListener('podium:friend-requests-updated', handleRequestsUpdated);
    return () => window.removeEventListener('podium:friend-requests-updated', handleRequestsUpdated);
  }, [user]);

  async function loadPendingRequestCount() {
    if (!user) {
      setPendingRequestCount(0);
      return;
    }

    try {
      const data = await connectionsApi.getRequests();
      setPendingRequestCount(data.incoming?.length || 0);
    } catch (err) {
      setPendingRequestCount(0);
    }
  }

  function handleLogout() {
    logout();
    navigate('/');
    setMobileMenuOpen(false);
  }

  function isActive(path) {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  const requestCountLabel = pendingRequestCount > 99 ? '99+' : pendingRequestCount;

  return (
    <header className="header glass">
      <div className="header-inner container">
        <Link to="/" className="header-logo" onClick={() => setMobileMenuOpen(false)}>
          <div className="logo-icon">🎭</div>
          <span className="logo-text">Podium</span>
        </Link>

        <nav className={`header-nav ${mobileMenuOpen ? 'open' : ''}`}>
          <Link
            to="/"
            className={`nav-link ${isActive('/') && location.pathname === '/' ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Home size={18} />
            <span>Home</span>
          </Link>
          <Link
            to="/theaters"
            className={`nav-link ${isActive('/theaters') ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Theater size={18} />
            <span>Theaters</span>
          </Link>
          <Link
            to="/agenda"
            className={`nav-link ${isActive('/agenda') ? 'active' : ''}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            <Calendar size={18} />
            <span>Agenda</span>
          </Link>
          {user && (
            <>
              <Link
                to="/vrienden"
                className={`nav-link ${isActive('/vrienden') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Users size={18} />
                <span>Vrienden</span>
              </Link>
              <Link
                to="/vriendschapsverzoeken"
                className={`nav-link ${isActive('/vriendschapsverzoeken') ? 'active' : ''}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                <Bell size={18} />
                <span>Verzoeken</span>
                {pendingRequestCount > 0 && (
                  <span className="nav-count-badge">{requestCountLabel}</span>
                )}
              </Link>
            </>
          )}

          {/* Mobile-only auth buttons */}
          {user ? (
            <div className="nav-mobile-auth">
              <Link
                to={`/profiel/${user.id}`}
                className="nav-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                <User size={18} />
                <span>Mijn Profiel</span>
              </Link>
              <button className="nav-link" onClick={handleLogout}>
                <LogOut size={18} />
                <span>Uitloggen</span>
              </button>
            </div>
          ) : (
            <div className="nav-mobile-auth">
              <Link to="/login" className="btn btn-primary btn-sm" onClick={() => setMobileMenuOpen(false)}>
                Inloggen
              </Link>
            </div>
          )}
        </nav>

        <div className="header-actions">
          {user ? (
            <div className="header-user">
              <Link
                to="/vriendschapsverzoeken"
                className="btn btn-icon btn-ghost request-icon-link"
                title={`${pendingRequestCount} ontvangen vriendschapsverzoeken`}
              >
                <Bell size={20} />
                {pendingRequestCount > 0 && (
                  <span className="request-icon-badge">{requestCountLabel}</span>
                )}
              </Link>
              <Link to={`/profiel/${user.id}`} className="header-avatar">
                <div className="avatar avatar-sm">
                  {user.name?.charAt(0).toUpperCase()}
                </div>
                <span className="header-username">{user.name?.split(' ')[0]}</span>
              </Link>
              <button className="btn btn-ghost btn-sm" onClick={handleLogout} title="Uitloggen">
                <LogOut size={18} />
              </button>
            </div>
          ) : (
            <div className="header-auth">
              <Link to="/login" className="btn btn-ghost btn-sm">Inloggen</Link>
              <Link to="/registreren" className="btn btn-primary btn-sm">Registreren</Link>
            </div>
          )}

          <button
            className="header-menu-btn btn btn-ghost btn-icon"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && <div className="mobile-overlay" onClick={() => setMobileMenuOpen(false)} />}
    </header>
  );
}
