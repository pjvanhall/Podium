import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { performancesApi } from '../services/api';
import { Calendar, MapPin, Users, Search, Filter } from 'lucide-react';
import './AgendaPage.css';

export default function AgendaPage() {
  const [performances, setPerformances] = useState([]);
  const [genres, setGenres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGenre, setSelectedGenre] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const [perfData, genreData] = await Promise.all([
        performancesApi.getAll(),
        performancesApi.getGenres(),
      ]);
      setPerformances(perfData.performances || []);
      setGenres(genreData.genres || []);
    } catch (err) {
      console.error('Error loading agenda:', err);
    } finally {
      setLoading(false);
    }
  }

  function formatDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('nl-NL', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }

  function formatTime(dateStr) {
    return new Date(dateStr).toLocaleTimeString('nl-NL', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  // Group performances by date
  function groupByDate(perfs) {
    const groups = {};
    perfs.forEach(p => {
      const dateKey = new Date(p.date_time).toLocaleDateString('nl-NL');
      if (!groups[dateKey]) {
        groups[dateKey] = {
          label: formatDate(p.date_time),
          performances: [],
        };
      }
      groups[dateKey].performances.push(p);
    });
    return Object.values(groups);
  }

  const filtered = performances.filter(p => {
    const matchesSearch = !searchQuery ||
      p.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.theatre_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesGenre = !selectedGenre || p.genre === selectedGenre;
    return matchesSearch && matchesGenre;
  });

  const dateGroups = groupByDate(filtered);

  return (
    <div className="page container">
      <div className="page-header animate-in">
        <h1>Agenda</h1>
        <p>Alle aankomende voorstellingen in Nederland</p>
      </div>

      <div className="agenda-filters animate-in animate-in-delay-1">
        <div className="search-bar">
          <Search size={18} />
          <input
            type="text"
            className="form-input"
            placeholder="Zoek op titel of theater..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="genre-filters">
          <button
            className={`genre-chip ${!selectedGenre ? 'active' : ''}`}
            onClick={() => setSelectedGenre('')}
          >
            Alles
          </button>
          {genres.map(genre => (
            <button
              key={genre}
              className={`genre-chip ${selectedGenre === genre ? 'active' : ''}`}
              onClick={() => setSelectedGenre(selectedGenre === genre ? '' : genre)}
            >
              {genre}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="agenda-list">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="agenda-item card">
              <div className="card-body" style={{ display: 'flex', gap: '16px' }}>
                <div className="skeleton" style={{ width: 60, height: 60, borderRadius: 10 }} />
                <div style={{ flex: 1 }}>
                  <div className="skeleton" style={{ height: 20, width: '60%', marginBottom: 8 }} />
                  <div className="skeleton" style={{ height: 16, width: '40%' }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : dateGroups.length === 0 ? (
        <div className="empty-state">
          <Calendar size={64} />
          <h3>Geen voorstellingen gevonden</h3>
          <p>Probeer een andere zoekopdracht of filter.</p>
        </div>
      ) : (
        <div className="agenda-timeline">
          {dateGroups.map((group, gi) => (
            <div key={gi} className="agenda-date-group animate-in" style={{ animationDelay: `${gi * 0.05}s` }}>
              <div className="agenda-date-label">
                <Calendar size={16} />
                <span>{group.label}</span>
              </div>
              <div className="agenda-list">
                {group.performances.map(perf => (
                  <Link
                    to={`/voorstelling/${perf.id}`}
                    key={perf.id}
                    className="agenda-item card"
                  >
                    <div className="agenda-item-time">
                      <span className="time-value">{formatTime(perf.date_time)}</span>
                      <span className="badge badge-accent">{perf.genre}</span>
                    </div>
                    <div className="agenda-item-info">
                      <h3 className="card-title">{perf.title}</h3>
                      <div className="card-meta">
                        <MapPin size={14} />
                        <span>{perf.theatre_name} · {perf.theatre_city}</span>
                      </div>
                    </div>
                    <div className="agenda-item-meta">
                      {perf.attendee_count > 0 && (
                        <div className="card-meta">
                          <Users size={14} />
                          <span>{perf.attendee_count}</span>
                        </div>
                      )}
                      {perf.is_attending && (
                        <span className="badge badge-success">Ik ga! 🎭</span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
