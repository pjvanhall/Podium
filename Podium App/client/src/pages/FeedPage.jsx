import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { feedApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Bell, Calendar, MapPin, Users, Theater, ArrowRight } from 'lucide-react';
import './FeedPage.css';

export default function FeedPage() {
  const { user } = useAuth();
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeed();
  }, []);

  async function loadFeed() {
    try {
      const data = await feedApi.getFeed();
      setFeed(data.feed || []);
    } catch (err) {
      console.error('Error loading feed:', err);
    } finally {
      setLoading(false);
    }
  }

  function timeAgo(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'zojuist';
    if (diff < 3600) return `${Math.floor(diff / 60)} min geleden`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} uur geleden`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} dagen geleden`;
    return date.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
  }

  if (!user) {
    return (
      <div className="page container">
        <div className="empty-state">
          <Users size={64} />
          <h3>Log in om je feed te zien</h3>
          <p>Zie wat je vrienden van plan zijn!</p>
          <Link to="/login" className="btn btn-primary" style={{ marginTop: 16 }}>Inloggen</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <div className="page-header feed-page-header animate-in">
        <div>
          <h1>Vrienden</h1>
          <p>Wat je vrienden van plan zijn</p>
        </div>
        <Link to="/vriendschapsverzoeken" className="btn btn-outline btn-sm">
          <Bell size={16} />
          Vriendschapsverzoeken
        </Link>
      </div>

      {loading ? (
        <div className="feed-list">
          {[1, 2, 3].map(i => (
            <div key={i} className="card feed-item">
              <div className="card-body" style={{ display: 'flex', gap: 16 }}>
                <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 18, width: '70%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 14, width: '50%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : feed.length === 0 ? (
        <div className="empty-state">
          <Users size={64} />
          <h3>Je feed is nog leeg</h3>
          <p>Voeg vrienden toe om hun activiteiten te zien!</p>
          <Link to="/zoeken" className="btn btn-primary" style={{ marginTop: 16 }}>
            Zoek gebruikers
          </Link>
        </div>
      ) : (
        <div className="feed-list">
          {feed.map((item, i) => (
            <div key={i} className="card feed-item animate-in" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="feed-item-content">
                <Link to={`/profiel/${item.user_id}`} className="feed-avatar">
                  <div className="avatar">
                    {item.user_name?.charAt(0).toUpperCase()}
                  </div>
                </Link>
                <div className="feed-item-body">
                  <p className="feed-item-text">
                    <Link to={`/profiel/${item.user_id}`} className="feed-user-name">{item.user_name}</Link>
                    {' '}gaat naar{' '}
                    <Link to={`/voorstelling/${item.performance_id}`} className="feed-perf-name">{item.performance_title}</Link>
                  </p>
                  <div className="feed-item-details">
                    <span className="card-meta">
                      <Theater size={14} />
                      <Link to={`/theater/${item.theatre_id}`}>{item.theatre_name}</Link>
                    </span>
                    <span className="card-meta">
                      <Calendar size={14} />
                      {formatDate(item.performance_date)}
                    </span>
                    <span className="card-meta">
                      <MapPin size={14} />
                      {item.theatre_city}
                    </span>
                  </div>
                  <span className="feed-time">{timeAgo(item.activity_date)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
