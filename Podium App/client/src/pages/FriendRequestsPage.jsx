import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Bell, Check, Clock, MapPin, Search, UserPlus, Users, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { connectionsApi, usersApi } from '../services/api';
import './FriendRequestsPage.css';

export default function FriendRequestsPage() {
  const { user } = useAuth();
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatuses, setSearchStatuses] = useState({});
  const [searchLoading, setSearchLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [sendingUserId, setSendingUserId] = useState(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    loadRequests();
  }, [user]);

  async function loadRequests() {
    setLoading(true);
    setError('');
    try {
      const data = await connectionsApi.getRequests();
      setIncoming(data.incoming || []);
      setOutgoing(data.outgoing || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    setMessage('');
    setError('');

    if (searchQuery.trim().length < 2) {
      setSearched(true);
      setSearchResults([]);
      return;
    }

    setSearchLoading(true);
    setSearched(true);
    try {
      const data = await usersApi.search(searchQuery.trim());
      const users = data.users || [];
      const statuses = {};

      await Promise.all(users.map(async result => {
        try {
          statuses[result.id] = await connectionsApi.getStatus(result.id);
        } catch (err) {
          statuses[result.id] = { status: 'unknown' };
        }
      }));

      setSearchResults(users);
      setSearchStatuses(statuses);
    } catch (err) {
      setError(err.message);
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }

  async function handleSendRequest(toUser) {
    setSendingUserId(toUser.id);
    setError('');
    setMessage('');

    try {
      await connectionsApi.sendRequest(toUser.id);
      setMessage(`Vriendschapsverzoek verstuurd naar ${toUser.name}.`);
      setSearchStatuses(prev => ({
        ...prev,
        [toUser.id]: { status: 'pending', direction: 'outgoing' },
      }));
      await loadRequests();
      window.dispatchEvent(new Event('podium:friend-requests-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSendingUserId(null);
    }
  }

  async function handleAccept(requestId) {
    setActionId(requestId);
    setError('');
    try {
      await connectionsApi.acceptRequest(requestId);
      setIncoming(prev => prev.filter(request => request.request_id !== requestId));
      setSearchStatuses(prev => Object.fromEntries(
        Object.entries(prev).map(([userId, status]) => [
          userId,
          status.requestId === requestId ? { ...status, status: 'accepted' } : status,
        ])
      ));
      window.dispatchEvent(new Event('podium:friend-requests-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  }

  async function handleReject(requestId) {
    setActionId(requestId);
    setError('');
    try {
      await connectionsApi.rejectRequest(requestId);
      setIncoming(prev => prev.filter(request => request.request_id !== requestId));
      window.dispatchEvent(new Event('podium:friend-requests-updated'));
    } catch (err) {
      setError(err.message);
    } finally {
      setActionId(null);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  function getSearchButtonState(result) {
    const status = searchStatuses[result.id];

    if (!status || status.status === 'none') {
      return {
        className: 'btn btn-primary btn-sm',
        disabled: false,
        label: <><UserPlus size={16} /> Verzoek sturen</>,
      };
    }

    if (status.status === 'pending' && status.direction === 'incoming') {
      return {
        className: 'btn btn-accent btn-sm',
        disabled: false,
        label: <><Check size={16} /> Accepteren</>,
        acceptRequestId: status.requestId,
      };
    }

    if (status.status === 'pending') {
      return {
        className: 'btn btn-ghost btn-sm',
        disabled: true,
        label: <><Clock size={16} /> Verstuurd</>,
      };
    }

    if (status.status === 'accepted') {
      return {
        className: 'btn btn-outline btn-sm',
        disabled: true,
        label: <><Check size={16} /> Vrienden</>,
      };
    }

    return {
      className: 'btn btn-outline btn-sm',
      disabled: true,
      label: 'Niet beschikbaar',
    };
  }

  if (!user) {
    return (
      <div className="page container">
        <div className="empty-state">
          <Users size={64} />
          <h3>Log in om vriendschapsverzoeken te zien</h3>
          <Link to="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Inloggen</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <Link to="/vrienden" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
        <ArrowLeft size={16} />
        Terug naar vrienden
      </Link>

      <div className="requests-page animate-in">
        <div className="page-header">
          <h1>Vriendschapsverzoeken</h1>
          <p>Beheer wie je theaterplannen kan volgen.</p>
        </div>

        {error && <div className="auth-error requests-error">{error}</div>}
        {message && <div className="requests-success">{message}</div>}

        <section className="card requests-search-card">
          <div className="card-body">
            <div className="requests-section-header">
              <UserPlus size={18} />
              <h2>Nieuw verzoek sturen</h2>
            </div>
            <form className="requests-search-form" onSubmit={handleSearch}>
              <div className="requests-search-bar">
                <Search size={18} />
                <input
                  type="text"
                  className="form-input"
                  placeholder="Zoek op naam..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  minLength={2}
                />
              </div>
              <button className="btn btn-accent" type="submit" disabled={searchLoading}>
                {searchLoading ? <span className="spinner" /> : <><Search size={18} /> Zoeken</>}
              </button>
            </form>

            {searched && !searchLoading && searchResults.length === 0 && (
              <p className="requests-search-empty">Geen gebruikers gevonden.</p>
            )}

            {searchResults.length > 0 && (
              <div className="requests-search-results">
                {searchResults.map(result => {
                  const buttonState = getSearchButtonState(result);
                  return (
                    <div key={result.id} className="request-search-result">
                      <Link to={`/profiel/${result.id}`} className="request-user">
                        <div className="avatar">
                          {result.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="card-title">{result.name}</h3>
                          <div className="request-meta">
                            {result.city && (
                              <span className="card-meta">
                                <MapPin size={14} />
                                {result.city}
                              </span>
                            )}
                          </div>
                        </div>
                      </Link>
                      <button
                        className={buttonState.className}
                        disabled={buttonState.disabled || sendingUserId === result.id}
                        onClick={() => buttonState.acceptRequestId ? handleAccept(buttonState.acceptRequestId) : handleSendRequest(result)}
                      >
                        {sendingUserId === result.id ? <span className="spinner" /> : buttonState.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {loading ? (
          <div className="requests-grid">
            {[1, 2].map(item => (
              <div key={item} className="card">
                <div className="card-body requests-skeleton">
                  <div className="skeleton" style={{ width: 48, height: 48, borderRadius: '50%' }} />
                  <div style={{ flex: 1 }}>
                    <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 8 }} />
                    <div className="skeleton" style={{ height: 16, width: '40%' }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="requests-grid">
            <section className="requests-section">
              <div className="requests-section-header">
                <Bell size={18} />
                <h2>Ontvangen</h2>
                <span className="badge badge-accent">{incoming.length}</span>
              </div>

              {incoming.length === 0 ? (
                <div className="card requests-empty-card">
                  <div className="card-body">
                    <UserPlus size={32} />
                    <p>Geen openstaande verzoeken.</p>
                  </div>
                </div>
              ) : (
                <div className="requests-list">
                  {incoming.map(request => (
                    <div key={request.request_id} className="card request-card">
                      <div className="card-body">
                        <Link to={`/profiel/${request.id}`} className="request-user">
                          <div className="avatar">
                            {request.name?.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="card-title">{request.name}</h3>
                            <div className="request-meta">
                              {request.city && (
                                <span className="card-meta">
                                  <MapPin size={14} />
                                  {request.city}
                                </span>
                              )}
                              <span className="card-meta">
                                <Clock size={14} />
                                {formatDate(request.created_at)}
                              </span>
                            </div>
                          </div>
                        </Link>

                        <div className="request-actions">
                          <button
                            className="btn btn-accent btn-sm"
                            onClick={() => handleAccept(request.request_id)}
                            disabled={actionId === request.request_id}
                          >
                            {actionId === request.request_id ? <span className="spinner" /> : <><Check size={16} /> Accepteren</>}
                          </button>
                          <button
                            className="btn btn-outline btn-sm"
                            onClick={() => handleReject(request.request_id)}
                            disabled={actionId === request.request_id}
                          >
                            <X size={16} />
                            Afwijzen
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="requests-section">
              <div className="requests-section-header">
                <Clock size={18} />
                <h2>Verstuurd</h2>
                <span className="badge">{outgoing.length}</span>
              </div>

              {outgoing.length === 0 ? (
                <div className="card requests-empty-card">
                  <div className="card-body">
                    <Users size={32} />
                    <p>Geen verzonden verzoeken.</p>
                  </div>
                </div>
              ) : (
                <div className="requests-list">
                  {outgoing.map(request => (
                    <Link to={`/profiel/${request.id}`} key={request.request_id} className="card request-card request-card-link">
                      <div className="card-body request-user">
                        <div className="avatar">
                          {request.name?.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <h3 className="card-title">{request.name}</h3>
                          <div className="request-meta">
                            {request.city && (
                              <span className="card-meta">
                                <MapPin size={14} />
                                {request.city}
                              </span>
                            )}
                            <span className="card-meta">
                              <Clock size={14} />
                              {formatDate(request.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
