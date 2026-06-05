import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { theatresApi } from '../services/api';
import { MapPin, Globe, Calendar, Users, Theater, ArrowLeft } from 'lucide-react';
import './DetailPages.css';

export default function TheatreDetailPage() {
  const { id } = useParams();
  const [theatre, setTheatre] = useState(null);
  const [performances, setPerformances] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTheatre();
  }, [id]);

  async function loadTheatre() {
    try {
      const data = await theatresApi.getById(id);
      setTheatre(data.theatre);
      setPerformances(data.performances || []);
    } catch (err) {
      console.error('Error loading theatre:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
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

  if (!theatre) {
    return (
      <div className="page container">
        <div className="empty-state">
          <h3>Theater niet gevonden</h3>
          <Link to="/theaters" className="btn btn-primary">Terug naar Theaters</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page container">
      <Link to="/theaters" className="btn btn-ghost btn-sm" style={{ marginBottom: 'var(--space-lg)' }}>
        <ArrowLeft size={16} />
        Alle theaters
      </Link>

      <div className="detail-page animate-in">
        <div className="detail-hero theatre-hero">
          <div className="theatre-hero-icon">
            <Theater size={48} />
          </div>
          <h1>{theatre.name}</h1>
          <div className="detail-meta-row">
            <div className="detail-meta-item">
              <MapPin size={18} />
              <span>{theatre.address}</span>
            </div>
            <div className="detail-meta-item">
              <span className="badge">{theatre.province}</span>
            </div>
          </div>
        </div>

        <div className="detail-content">
          <div className="detail-main">
            {theatre.description && (
              <div className="detail-section">
                <h3>Over dit theater</h3>
                <p>{theatre.description}</p>
              </div>
            )}

            {theatre.website && (
              <a href={theatre.website} target="_blank" rel="noopener noreferrer" className="btn btn-outline" style={{ marginBottom: 'var(--space-2xl)' }}>
                <Globe size={18} />
                Website bezoeken
              </a>
            )}

            <div className="detail-section">
              <h3>Aankomende voorstellingen ({performances.length})</h3>
              {performances.length === 0 ? (
                <p className="text-muted">Geen aankomende voorstellingen gepland.</p>
              ) : (
                <div className="agenda-list">
                  {performances.map(perf => (
                    <Link
                      to={`/voorstelling/${perf.id}`}
                      key={perf.id}
                      className="agenda-item card"
                    >
                      <div className="agenda-item-time">
                        <span className="time-value">{formatTime(perf.date_time)}</span>
                        <span className="text-muted" style={{ fontSize: '0.8rem' }}>{formatDate(perf.date_time)}</span>
                      </div>
                      <div className="agenda-item-info">
                        <h3 className="card-title">{perf.title}</h3>
                        <span className="badge badge-accent">{perf.genre}</span>
                      </div>
                      <div className="agenda-item-meta">
                        {perf.attendee_count > 0 && (
                          <div className="card-meta">
                            <Users size={14} />
                            <span>{perf.attendee_count}</span>
                          </div>
                        )}
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
