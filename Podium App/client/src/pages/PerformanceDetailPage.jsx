import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { performancesApi, attendanceApi } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Calendar, MapPin, Users, Clock, Tag, ExternalLink, Check, Plus } from 'lucide-react';
import './DetailPages.css';

export default function PerformanceDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [performance, setPerformance] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attending, setAttending] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    loadPerformance();
  }, [id]);

  async function loadPerformance() {
    try {
      const data = await performancesApi.getById(id);
      setPerformance(data.performance);
      setAttendees(data.attendees || []);
      setAttending(data.performance?.is_attending || false);
    } catch (err) {
      console.error('Error loading performance:', err);
    } finally {
      setLoading(false);
    }
  }

  async function toggleAttendance() {
    if (!user) return;
    setToggling(true);
    try {
      if (attending) {
        await attendanceApi.removeAttending(id);
        setAttending(false);
        setAttendees(prev => prev.filter(a => a.id !== user.id));
      } else {
        await attendanceApi.markAttending(id);
        setAttending(true);
        setAttendees(prev => [{ id: user.id, name: user.name, avatar: user.avatar, city: user.city }, ...prev]);
      }
    } catch (err) {
      console.error('Error toggling attendance:', err);
    } finally {
      setToggling(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <div className="page container">
        <div className="detail-hero">
          <div className="skeleton" style={{ height: 48, width: '60%', marginBottom: 16 }} />
          <div className="skeleton" style={{ height: 24, width: '40%' }} />
        </div>
      </div>
    );
  }

  if (!performance) {
    return (
      <div className="page container">
        <div className="empty-state">
          <h3>Voorstelling niet gevonden</h3>
          <Link to="/agenda" className="btn btn-primary">Terug naar Agenda</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <div className="detail-page animate-in">
        <div className="detail-hero">
          <span className="badge badge-accent">{performance.genre}</span>
          <h1>{performance.title}</h1>
          <div className="detail-meta-row">
            <div className="detail-meta-item">
              <MapPin size={18} />
              <Link to={`/theater/${performance.theatre_id}`}>
                {performance.theatre_name} · {performance.theatre_city}
              </Link>
            </div>
            <div className="detail-meta-item">
              <Calendar size={18} />
              <span>{formatDate(performance.date_time)}</span>
            </div>
            <div className="detail-meta-item">
              <Clock size={18} />
              <span>{formatTime(performance.date_time)}</span>
            </div>
          </div>
        </div>

        <div className="detail-content">
          <div className="detail-main">
            {performance.description && (
              <div className="detail-section">
                <h3>Over deze voorstelling</h3>
                <p>{performance.description}</p>
              </div>
            )}

            <div className="detail-section">
              <h3>Locatie</h3>
              <div className="detail-location-card card">
                <div className="card-body">
                  <h4>{performance.theatre_name}</h4>
                  <p className="text-secondary">{performance.theatre_address}</p>
                  <Link to={`/theater/${performance.theatre_id}`} className="btn btn-outline btn-sm" style={{ marginTop: 12 }}>
                    Bekijk theater
                  </Link>
                </div>
              </div>
            </div>

            {performance.ticket_url && (
              <a href={performance.ticket_url} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
                <ExternalLink size={18} />
                Tickets kopen
              </a>
            )}
          </div>

          <div className="detail-sidebar">
            {user && (
              <button
                className={`btn ${attending ? 'btn-accent' : 'btn-primary'} btn-lg detail-attend-btn`}
                onClick={toggleAttendance}
                disabled={toggling}
              >
                {toggling ? (
                  <span className="spinner" />
                ) : attending ? (
                  <>
                    <Check size={20} />
                    Ik ga! 🎭
                  </>
                ) : (
                  <>
                    <Plus size={20} />
                    Ik ga erheen
                  </>
                )}
              </button>
            )}

            {!user && (
              <Link to="/login" className="btn btn-primary btn-lg detail-attend-btn">
                Log in om je aan te melden
              </Link>
            )}

            <div className="detail-attendees">
              <h4>
                <Users size={18} />
                Wie gaat er? ({attendees.length})
              </h4>
              {attendees.length === 0 ? (
                <p className="text-muted" style={{ fontSize: '0.9rem' }}>
                  Nog niemand aangemeld. Wees de eerste!
                </p>
              ) : (
                <div className="attendee-list">
                  {attendees.map(a => (
                    <Link to={`/profiel/${a.id}`} key={a.id} className="attendee-item">
                      <div className="avatar avatar-sm">
                        {a.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <span className="attendee-name">{a.name}</span>
                        {a.city && <span className="attendee-city">{a.city}</span>}
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
