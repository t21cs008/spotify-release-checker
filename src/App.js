// src/App.js
import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';
import { auth, database } from './firebase';
import { useAuthState } from 'react-firebase-hooks/auth';
import Login from './Login';
import './App.css';

// ▼ SpotifyのClient ID / Secret をあなたのアプリのものに置き換えてください
const CLIENT_ID = "c735f0cbc16143288401c000b19d6cc8";
const CLIENT_SECRET = "bfdf0e1ce50e45749e7b416de2d009da";

// プレフィックスの配列（A-Z）
const PREFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function App() {
  const [dateInput, setDateInput] = useState(dayjs().format('YYYY-MM-DD'));
  const [releases, setReleases] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [user] = useAuthState(auth);
  const [likes, setLikes] = useState([]);
  const [sortOption, setSortOption] = useState('name-asc'); // デフォルトの並び替えオプション

  // Realtime Databaseのユーザーデータ参照
  const userReleasesRef = user ? database.ref(`users/${user.uid}/releases`) : null;
  const userLikesRef = user ? database.ref(`users/${user.uid}/likes`) : null;

  // Realtime Databaseからデータを読み込む
  useEffect(() => {
    if (user) {
      // リリースデータの取得
      userReleasesRef.on('value', (snapshot) => {
        const data = snapshot.val() || {};
        setReleases(data);
      });

      // ライクデータの取得
      userLikesRef.on('value', (snapshot) => {
        const data = snapshot.val() || {};
        const likedItems = Object.values(data);
        setLikes(likedItems);
      });
    } else {
      setReleases({});
      setLikes([]);
    }

    // クリーンアップ
    return () => {
      if (userReleasesRef) userReleasesRef.off();
      if (userLikesRef) userLikesRef.off();
    };
  }, [user, userReleasesRef, userLikesRef]);

  // アクセストークンを取得する関数
  const getAccessToken = async () => {
    try {
      const tokenUrl = 'https://accounts.spotify.com/api/token';
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
        },
        body: 'grant_type=client_credentials'
      });
      const data = await response.json();
      if (data.access_token) {
        return data.access_token;
      } else {
        throw new Error("アクセストークンが取得できませんでした。");
      }
    } catch (err) {
      setError("アクセストークンの取得に失敗しました: " + err.message);
      console.error(err);
      return null;
    }
  };

  // プレフィックスごとのリリースを取得
  const fetchReleasesByPrefix = async (prefix, selectedYear, accessToken) => {
    let offset = 0;
    let allItems = [];
    const limit = 50; // 一度に取得するアイテム数

    while (offset < 1000) { // Spotify APIの上限
      const query = `${prefix}* year:${selectedYear}`;
      const searchUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=album&limit=${limit}&offset=${offset}`;
      try {
        const response = await fetch(searchUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
        });
        const data = await response.json();

        if (!data.albums || !data.albums.items || data.albums.items.length === 0) {
          break;
        }

        allItems = allItems.concat(data.albums.items);

        if (data.albums.next) {
          offset += limit;
        } else {
          break;
        }
      } catch (err) {
        console.error(`Error fetching prefix ${prefix} at offset ${offset}:`, err);
        setError(`プレフィックス ${prefix} のリリース取得中にエラーが発生しました: ${err.message}`);
        break;
      }
    }

    return allItems;
  };

  // 指定日のリリースを取得
  const fetchReleasesByDate = async (selectedDate) => {
    if (!user) {
      setError("ログインしてください。");
      return;
    }

    setLoading(true);
    setError("");

    const selectedDay = dayjs(selectedDate).format('YYYY-MM-DD');
    const selectedYear = dayjs(selectedDate).format('YYYY');

    try {
      // Realtime Databaseでキャッシュを確認
      const snapshot = await userReleasesRef.child(selectedDay).once('value');
      if (snapshot.exists()) {
        setReleases(prev => ({
          ...prev,
          [selectedDay]: snapshot.val()
        }));
        setLoading(false);
        return;
      }

      const accessToken = await getAccessToken();
      if (!accessToken) {
        setLoading(false);
        return;
      }

      let allFetchedItems = [];

      // プレフィックスごとに検索
      for (const prefix of PREFIXES) {
        const items = await fetchReleasesByPrefix(prefix, selectedYear, accessToken);
        allFetchedItems = allFetchedItems.concat(items);
      }

      // フィルタリング
      const filtered = allFetchedItems.filter(item => {
        // Spotifyのrelease_date_precisionにより、release_dateが年や月のみの場合があるため、正確な日付で比較
        return item.release_date === selectedDay;
      });

      if (filtered.length === 0) {
        setError(`指定日 (${selectedDay}) に対応するリリースは見つかりませんでした。`);
        setLoading(false);
        return;
      }

      // 日付ごとに分類
      const releasesByDate = { albums: [], singles: [] };
      filtered.forEach(item => {
        if (item.album_type === 'album') {
          releasesByDate.albums.push(item);
        } else if (item.album_type === 'single') {
          releasesByDate.singles.push(item);
        }
      });

      // Realtime Databaseに保存
      await userReleasesRef.child(selectedDay).set(releasesByDate);

      setReleases(prev => ({
        ...prev,
        [selectedDay]: releasesByDate
      }));

    } catch (err) {
      console.error(err);
      setError("リリース取得中にエラーが発生しました: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // ライク機能の実装
  const toggleLike = async (item) => {
    if (!user) {
      setError("ログインしてください。");
      return;
    }

    try {
      const likeRef = userLikesRef.child(item.id);
      const snapshot = await likeRef.once('value');
      if (snapshot.exists()) {
        // 既にライクしている場合、ライクを解除
        await likeRef.remove();
        setLikes(prev => prev.filter(liked => liked.id !== item.id));
      } else {
        // ライクしていない場合、ライクを追加
        await likeRef.set(item);
        setLikes(prev => [...prev, item]);
      }
    } catch (err) {
      console.error("ライクのトグル中にエラーが発生しました:", err);
      setError("ライクの更新に失敗しました。");
    }
  };

  // 検索ボタン押下
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!dateInput) {
      setError("日付を入力してください。");
      return;
    }
    await fetchReleasesByDate(dateInput);
  };

  // アプリ起動時に今日のリリースを自動で取得
  useEffect(() => {
    if (user) {
      const today = dayjs().format('YYYY-MM-DD');
      fetchReleasesByDate(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // HTMLとして保存する関数
  const saveAsHTML = () => {
    if (!user) {
      setError("ログインしてください。");
      return;
    }

    const today = dayjs().format('YYYY-MM-DD');
    const data = releases[today];
    if (!data) {
      alert("保存するリリース情報がありません。");
      return;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Spotifyリリース情報 - ${today}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      margin: 20px;
    }
    .grid {
      display: flex;
      flex-wrap: wrap;
      gap: 20px;
    }
    .card {
      border: 1px solid #ccc;
      border-radius: 8px;
      padding: 10px;
      width: 200px;
      box-shadow: 2px 2px 12px rgba(0,0,0,0.1);
      text-align: center;
    }
    .card img {
      width: 100%;
      height: auto;
      border-radius: 4px;
    }
    .card h3 {
      font-size: 16px;
      margin: 10px 0 5px 0;
    }
    .card p {
      font-size: 14px;
      margin: 5px 0;
    }
    h2, h3 {
      color: #333;
    }
  </style>
</head>
<body>
  <h1>Spotifyリリース情報 - ${today}</h1>
  <h2>【アルバム】</h2>
  <div class="grid">
    ${data.albums.map(item => `
      <div class="card">
        <img src="${item.images && item.images[0] ? item.images[0].url : ''}" alt="${item.name}">
        <h3>${item.name}</h3>
        <p>アーティスト: ${item.artists && item.artists[0] ? item.artists[0].name : '不明'}</p>
        <p>リリース日: ${item.release_date}</p>
        <p><a href="${item.external_urls.spotify}" target="_blank">Spotifyで見る</a></p>
      </div>
    `).join('')}
  </div>
  
  <h2>【シングル】</h2>
  <div class="grid">
    ${data.singles.map(item => `
      <div class="card">
        <img src="${item.images && item.images[0] ? item.images[0].url : ''}" alt="${item.name}">
        <h3>${item.name}</h3>
        <p>アーティスト: ${item.artists && item.artists[0] ? item.artists[0].name : '不明'}</p>
        <p>リリース日: ${item.release_date}</p>
        <p><a href="${item.external_urls.spotify}" target="_blank">Spotifyで見る</a></p>
      </div>
    `).join('')}
  </div>
</body>
</html>
    `;

    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Spotify_Releases_${today}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 並び替えオプションの変更
  const handleSortChange = (e) => {
    setSortOption(e.target.value);
  };

  // 並び替えを適用したリリースデータを取得
  const getSortedReleases = () => {
    const sortedReleases = { ...releases };
    Object.keys(sortedReleases).forEach(date => {
      const { albums, singles } = sortedReleases[date];
      
      // 並び替えロジック
      const sortFunctions = {
        'name-asc': (a, b) => a.name.localeCompare(b.name),
        'name-desc': (a, b) => b.name.localeCompare(a.name),
        'genre-asc': (a, b) => {
          const genreA = a.genres ? a.genres[0] : 'Unknown';
          const genreB = b.genres ? b.genres[0] : 'Unknown';
          return genreA.localeCompare(genreB);
        },
        'genre-desc': (a, b) => {
          const genreA = a.genres ? a.genres[0] : 'Unknown';
          const genreB = b.genres ? b.genres[0] : 'Unknown';
          return genreB.localeCompare(genreA);
        },
      };

      const sortFunc = sortFunctions[sortOption] || sortFunctions['name-asc'];

      sortedReleases[date].albums.sort(sortFunc);
      sortedReleases[date].singles.sort(sortFunc);
    });

    return sortedReleases;
  };

  return (
    <div style={styles.container}>
      <h1>Spotifyリリースチェッカー</h1>
      <p>指定した日付のリリース作品を取得します。（アルバム／シングルを区別）</p>

      {/* 認証部分 */}
      <div style={styles.authSection}>
        {user ? (
          <div style={styles.userInfo}>
            <p>ログイン中: {user.email}</p>
            <button onClick={() => auth.signOut()} style={styles.logoutButton}>ログアウト</button>
          </div>
        ) : (
          <Login />
        )}
      </div>

      {/* 検索フォーム */}
      <form onSubmit={handleSearch} style={styles.searchForm}>
        <label>
          日付を選択:{" "}
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            style={styles.dateInput}
            max={dayjs().format('YYYY-MM-DD')} // 最大日付を今日に設定
          />
        </label>
        <button type="submit" style={styles.searchButton}>検索</button>
        <button type="button" onClick={saveAsHTML} style={styles.saveButton}>
          HTMLとして保存
        </button>
      </form>

      {/* 並び替えオプション */}
      <div style={styles.sortSection}>
        <label>並び替え: </label>
        <select value={sortOption} onChange={handleSortChange} style={styles.sortSelect}>
          <option value="name-asc">名前の昇順</option>
          <option value="name-desc">名前の降順</option>
          <option value="genre-asc">ジャンルの昇順</option>
          <option value="genre-desc">ジャンルの降順</option>
        </select>
      </div>

      {loading && <p>検索中です…</p>}
      {error && <p style={styles.error}>{error}</p>}

      {/* リリース情報の表示 */}
      {Object.keys(releases).length > 0 && (
        Object.keys(getSortedReleases()).sort().map(date => (
          <div key={date} style={styles.releaseSection}>
            <h2>{date}</h2>
            <div>
              <h3>【アルバム】</h3>
              {releases[date].albums.length > 0 ? (
                <div style={styles.grid}>
                  {releases[date].albums.map(item => (
                    <div
                      key={item.id}
                      style={styles.card}
                    >
                      <img
                        src={item.images && item.images[0] ? item.images[0].url : ''}
                        alt={item.name}
                        style={styles.image}
                      />
                      <h3 style={styles.cardTitle}>{item.name}</h3>
                      {item.artists && item.artists[0] && (
                        <p style={styles.cardText}>アーティスト: {item.artists[0].name}</p>
                      )}
                      <p style={styles.cardText}>
                        リリース日: {item.release_date}
                      </p>
                      <button
                        onClick={() => toggleLike(item)}
                        style={{
                          ...styles.likeButton,
                          color: likes.find(liked => liked.id === item.id) ? 'red' : 'grey'
                        }}
                      >
                        ♥
                      </button>
                      <p style={styles.cardLink}>
                        <a href={item.external_urls.spotify} target="_blank" rel="noopener noreferrer">
                          Spotifyで見る
                        </a>
                      </p>
                    </div>
                  ))}
                </div>
              ) : <p>アルバムはありません。</p>}
            </div>
            <div>
              <h3>【シングル】</h3>
              {releases[date].singles.length > 0 ? (
                <div style={styles.grid}>
                  {releases[date].singles.map(item => (
                    <div
                      key={item.id}
                      style={styles.card}
                    >
                      <img
                        src={item.images && item.images[0] ? item.images[0].url : ''}
                        alt={item.name}
                        style={styles.image}
                      />
                      <h3 style={styles.cardTitle}>{item.name}</h3>
                      {item.artists && item.artists[0] && (
                        <p style={styles.cardText}>アーティスト: {item.artists[0].name}</p>
                      )}
                      <p style={styles.cardText}>
                        リリース日: {item.release_date}
                      </p>
                      <button
                        onClick={() => toggleLike(item)}
                        style={{
                          ...styles.likeButton,
                          color: likes.find(liked => liked.id === item.id) ? 'red' : 'grey'
                        }}
                      >
                        ♥
                      </button>
                      <p style={styles.cardLink}>
                        <a href={item.external_urls.spotify} target="_blank" rel="noopener noreferrer">
                          Spotifyで見る
                        </a>
                      </p>
                    </div>
                  ))}
                </div>
              ) : <p>シングルはありません。</p>}
            </div>
          </div>
        ))
      )}

      {/* ライク一覧の表示 */}
      {likes.length > 0 && (
        <div style={styles.likedSection}>
          <h2>ライクしたアルバム/シングル</h2>
          <div style={styles.grid}>
            {likes.map(item => (
              <div
                key={item.id}
                style={styles.card}
              >
                <img
                  src={item.images && item.images[0] ? item.images[0].url : ''}
                  alt={item.name}
                  style={styles.image}
                />
                <h3 style={styles.cardTitle}>{item.name}</h3>
                {item.artists && item.artists[0] && (
                  <p style={styles.cardText}>アーティスト: {item.artists[0].name}</p>
                )}
                <p style={styles.cardText}>
                  リリース日: {item.release_date}
                </p>
                <button
                  onClick={() => toggleLike(item)}
                  style={{
                    ...styles.likeButton,
                    color: 'red'
                  }}
                >
                  ♥
                </button>
                <p style={styles.cardLink}>
                  <a href={item.external_urls.spotify} target="_blank" rel="noopener noreferrer">
                    Spotifyで見る
                  </a>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    margin: '20px',
    fontFamily: 'Arial, sans-serif',
  },
  authSection: {
    marginBottom: '20px',
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logoutButton: {
    padding: '8px 12px',
    backgroundColor: '#e0245e',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  searchForm: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  dateInput: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  searchButton: {
    padding: '8px 12px',
    backgroundColor: '#1db954',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '8px 12px',
    backgroundColor: '#657786',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  sortSection: {
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  },
  sortSelect: {
    padding: '8px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  error: {
    color: 'red',
  },
  releaseSection: {
    marginTop: '20px',
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '20px',
  },
  card: {
    border: '1px solid #ccc',
    borderRadius: '8px',
    padding: '10px',
    width: '200px',
    boxShadow: '2px 2px 12px rgba(0,0,0,0.1)',
    textAlign: 'center',
    position: 'relative',
    backgroundColor: '#fff',
  },
  image: {
    width: '100%',
    height: 'auto',
    borderRadius: '4px',
  },
  cardTitle: {
    margin: '10px 0 5px 0',
    fontSize: '16px',
    color: '#333',
  },
  cardText: {
    margin: '5px 0',
    fontSize: '14px',
    color: '#555',
  },
  likeButton: {
    position: 'absolute',
    top: '10px',
    right: '10px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '20px',
  },
  cardLink: {
    margin: '5px 0',
    fontSize: '12px',
  },
  likedSection: {
    marginTop: '40px',
  },
};

export default App;
