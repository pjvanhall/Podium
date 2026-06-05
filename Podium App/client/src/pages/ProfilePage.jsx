import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { usersApi, connectionsApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { MapPin, Calendar, Users, Edit, UserPlus, UserMinus, Check, Clock } from 'lucide-react';
import './ProfilePage.css';

export default function ProfilePage() {
  const { id } = useParams();
  const { user: currentUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [performances, setPerformances] = useState([]);
  const [friends, setFriends] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('agenda');

  const isOwnProfile = currentUser && parseInt(id) === currentUser.id;

  useEffect(() => {
    loadProfile();
  }, [id, currentUser?.id]);

  async function loadProfile() {
    setLoading(true);
    try {
      const [profileData, perfData, friendsData] = await Promise.all([
        usersApi.getProfile(id),
        usersApi.getAttending(id),
        connectionsApi.getFriends(id),
      ]);
      setProfile(profileData.user);
      setPerformances(perfData.performances || []);
      setFriends(friendsData.friends || []);
      setConnectionStatus(null);

      if (currentUser && !isOwnProfile) {
        const statusData = await connectionsApi.getStatus(id);
        setConnectionStatus(statusData);
      }
    } catch (err) {
      console.error('Error loading profile:', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleFriendAction() {
    if (!connectionStatus) return;
    try {
      if (connectionStatus.status === 'none') {
        await connectionsApi.sendRequest(id);
        setConnectionStatus({ status: 'pending', direction: 'outgoing' });
      } else if (connectionStatus.status === 'pending' && connectionStatus.direction === 'incoming') {
        await connectionsApi.acceptRequest(connectionStatus.requestId);
        setConnectionStatus({ status: 'accepted' });
        loadProfile();
      } else if (connectionStatus.status === 'accepted') {
        await connectionsApi.unfriend(id);
        setConnectionStatus({ status: 'none' });
        loadProfile();
      }
    } catch (err) {
      console.error('Error with friend action:', err);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'short', day: 'numeric', month: 'short',
    });
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('nl-NL', {
      hour: '2-digit', minute: '2-digit',
    });
  }

  function getFriendButtonContent() {
    if (!connectionStatus) return null;
    switch (connectionStatus.status) {
      case 'none':
        return <><UserPlus size={16} /> Vriendschapsverzoek sturen</>;
      case 'pending':
        return connectionStatus.direction === 'outgoing'
          ? <><Clock size={16} /> Verzoek verstuurd</>
          : <><Check size={16} /> Accepteren</>;
      case 'accepted':
        return <><UserMinus size={16} /> Ontvrienden</>;
      default:
        return null;
    }
  }

  if (loading) {
    return (
      <div className="page container">
        <div className="profile-header">
          <div className="skeleton" style={{ width: 80, height: 80, borderRadius: '50%' }} />
          <div>
            <div className="skeleton" style={{ height: 32, width: 200, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 18, width: 140 }} />
          </div>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="page container">
        <div className="empty-state">
          <h3>Gebruiker niet gevonden</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <div className="profile-page animate-in">
        <div className="profile-header">
          <div className="avatar avatar-xl">
            {profile.name?.charAt(0).toUpperCase()}
          </div>
          <div className="profile-info">
            <h1>{profile.name}</h1>
            {profile.city && (
              <div className="profile-location">
                <MapPin size={16} />
                <span>{profile.city}</span>
              </div>
            )}
            {profile.bio && <p className="profile-bio">{profile.bio}</p>}
            <div className="profile-stats">
              <div className="profile-stat">
                <strong>{profile.friendCount || 0}</strong>
                <span>Vrienden</span>
              </div>
              <div className="profile-stat">
                <strong>{profile.upcomingCount || 0}</strong>
                <span>Voorstellingen</span>
              </div>
            </div>
          </div>
          <div className="profile-actions">
            {isOwnProfile ? (
              <Link to={`/profiel/${id}/bewerken`} className="btn btn-outline btn-sm">
                <Edit size={16} />
                Profiel bewerken
              </Link>
            ) : currentUser && connectionStatus ? (
              <button
                className={`btn btn-sm ${connectionStatus.status === 'accepted' ? 'btn-outline' : connectionStatus.status === 'pending' && connectionStatus.direction === 'outgoing' ? 'btn-ghost' : 'btn-primary'}`}
                onClick={handleFriendAction}
                disabled={connectionStatus.status === 'pending' && connectionStatus.direction === 'outgoing'}
              >
                {getFriendButtonContent()}
              </button>
            ) : null}
          </div>
        </div>

        <div className="profile-tabs">
          <button
            className={`profile-tab ${activeTab === 'agenda' ? 'active' : ''}`}
            onClick={() => setActiveTab('agenda')}
          >
            <Calendar size={16} />
            Agenda ({performances.length})
          </button>
          <button
            className={`profile-tab ${activeTab === 'vrienden' ? 'active' : ''}`}
            onClick={() => setActiveTab('vrienden')}
          >
            <Users size={16} />
            Vrienden ({friends.length})
          </button>
        </div>

        <div className="profile-content">
          {activeTab === 'agenda' && (
            performances.length === 0 ? (
              <div className="empty-state">
                <Calendar size={48} />
                <h3>Nog geen voorstellingen</h3>
                <p>{isOwnProfile ? 'Ga naar de agenda om voorstellingen te vinden!' : 'Deze gebruiker heeft zich nog niet aangemeld voor voorstellingen.'}</p>
                {isOwnProfile && (
                  <Link to="/agenda" className="btn btn-primary" style={{ marginTop: 16 }}>Bekijk Agenda</Link>
                )}
              </div>
            ) : (
              <div className="agenda-list">
                {performances.map(perf => (
                  <Link to={`/voorstelling/${perf.performance_id || perf.id}`} key={perf.id} className="agenda-item card">
                    <div className="agenda-item-time">
                      <span className="time-value">{formatTime(perf.date_time)}</span>
                      <span className="text-muted" style={{ fontSize: '0.8rem' }}>{formatDate(perf.date_time)}</span>
                    </div>
                    <div className="agenda-item-info">
                      <h3 className="card-title">{perf.title}</h3>
                      <div className="card-meta">
                        <MapPin size={14} />
                        <span>{perf.theatre_name} · {perf.theatre_city}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}

          {activeTab === 'vrienden' && (
            friends.length === 0 ? (
              <div className="empty-state">
                <Users size={48} />
                <h3>Nog geen vrienden</h3>
                <p>{isOwnProfile ? 'Zoek andere theaterliefhebbers!' : 'Deze gebruiker heeft nog geen vrienden.'}</p>
                {isOwnProfile && (
                  <Link to="/zoeken" className="btn btn-primary" style={{ marginTop: 16 }}>Zoek Gebruikers</Link>
                )}
              </div>
            ) : (
              <div className="friends-grid">
                {friends.map(friend => (
                  <Link to={`/profiel/${friend.id}`} key={friend.id} className="card friend-card">
                    <div className="card-body" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div className="avatar">
                        {friend.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="card-title" style={{ fontSize: '0.95rem' }}>{friend.name}</span>
                        {friend.city && (
                          <div className="card-meta">
                            <MapPin size={12} />
                            <span>{friend.city}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
