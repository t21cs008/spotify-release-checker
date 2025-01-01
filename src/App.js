import React, { useState, useEffect } from 'react';
import dayjs from 'dayjs';

// ▼ SpotifyのClient ID / Secret をあなたのアプリのものに置き換えてください
const CLIENT_ID = "c735f0cbc16143288401c000b19d6cc8";
const CLIENT_SECRET = "bfdf0e1ce50e45749e7b416de2d009da";

// ローカルストレージのキー
const STORAGE_KEY = 'spotify_releases';

// プレフィックスの配列（A-Z）
const PREFIXES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

function App() {
  const [dateInput, setDateInput] = useState(dayjs().format('YYYY-MM-DD'));
  const [releases, setReleases] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchedPrefixes, setFetchedPrefixes] = useState({}); // { '2025-01-01': ['A', 'B', ...], ... }

  // ローカルストレージからデータを読み込む
  useEffect(() => {
    const storedData = localStorage.getItem(STORAGE_KEY);
    if (storedData) {
      const parsedData = JSON.parse(storedData);
      setReleases(parsedData.releases || {});
      setFetchedPrefixes(parsedData.fetchedPrefixes || {});
    }
  }, []);

  // データをローカルストレージに保存する
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ releases, fetchedPrefixes }));
  }, [releases, fetchedPrefixes]);

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
    setLoading(true);
    setError("");

    const selectedDay = dayjs(selectedDate).format('YYYY-MM-DD');
    const selectedYear = dayjs(selectedDate).format('YYYY');

    // 既にその日のプレフィックスを取得済みか確認
    const prefixesFetchedForDate = fetchedPrefixes[selectedDay] || [];
    const prefixesToFetch = PREFIXES.filter(prefix => !prefixesFetchedForDate.includes(prefix));

    if (prefixesToFetch.length === 0) {
      // 既に全てのプレフィックスが取得済みなので、データを表示する
      filterAndSetReleases(selectedDay);
      setLoading(false);
      return;
    }

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setLoading(false);
      return;
    }

    try {
      let allFetchedItems = releases[selectedDay] ? [...releases[selectedDay].albums, ...releases[selectedDay].singles] : [];

      // プレフィックスごとに検索
      for (const prefix of prefixesToFetch) {
        const items = await fetchReleasesByPrefix(prefix, selectedYear, accessToken);
        allFetchedItems = allFetchedItems.concat(items);
        // フェッチ済みのプレフィックスに追加
        setFetchedPrefixes(prev => ({
          ...prev,
          [selectedDay]: prev[selectedDay] ? [...prev[selectedDay], prefix] : [prefix]
        }));
      }

      // フィルタリング
      const filtered = allFetchedItems.filter(item => {
        // Spotifyのrelease_date_precisionにより、release_dateが年や月のみの場合があるため、正確な日付で比較
        return item.release_date === selectedDay;
      });

      if (filtered.length === 0) {
        setError(`指定日 (${selectedDay}) に対応するリリースは見つかりませんでした。`);
      }

      // 日付ごとに分類
      const releasesByDate = { ...releases };
      if (!releasesByDate[selectedDay]) {
        releasesByDate[selectedDay] = { albums: [], singles: [] };
      }
      filtered.forEach(item => {
        if (item.album_type === 'album') {
          releasesByDate[selectedDay].albums.push(item);
        } else if (item.album_type === 'single') {
          releasesByDate[selectedDay].singles.push(item);
        }
      });

      setReleases(releasesByDate);

    } catch (err) {
      console.error(err);
      setError("リリース取得中にエラーが発生しました: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  // 指定日のリリースをフィルターしてセット
  const filterAndSetReleases = (selectedDay) => {
    const filtered = [];
    if (releases[selectedDay]) {
      filtered.push(...releases[selectedDay].albums, ...releases[selectedDay].singles);
    }

    if (filtered.length === 0) {
      setError(`指定日 (${selectedDay}) に対応するリリースは見つかりませんでした。`);
    }

    // 日付ごとに分類（既に分類済みなので再分類は不要）
    // そのまま releases を表示する

    // Force re-render by setting releases state
    setReleases({ ...releases });
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
    const today = dayjs().format('YYYY-MM-DD');
    if (!releases[today]) {
      fetchReleasesByDate(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // HTMLとして保存する関数
  const saveAsHTML = () => {
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

  return (
    <div style={{ margin: '20px' }}>
      <h1>Spotifyリリースチェッカー</h1>
      <p>指定した日付のリリース作品を取得します。（アルバム／シングルを区別）</p>
      <form onSubmit={handleSearch}>
        <label>
          日付を選択:{" "}
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            style={{ marginRight: '10px' }}
            min="2025-01-01" // 最小日付を2025年1月1日に設定
          />
        </label>
        <button type="submit">検索</button>
        <button type="button" onClick={saveAsHTML} style={{ marginLeft: '10px' }}>
          HTMLとして保存
        </button>
      </form>

      {loading && <p>検索中です…</p>}
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {Object.keys(releases).length > 0 && (
        Object.keys(releases).sort().map(date => (
          <div key={date} style={{ marginTop: '20px' }}>
            <h2>{date}</h2>
            <div>
              <h3>【アルバム】</h3>
              {releases[date].albums.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                  {releases[date].albums.map(item => (
                    <div
                      key={item.id}
                      style={{
                        border: '1px solid #ccc',
                        borderRadius: '8px',
                        padding: '10px',
                        width: '200px',
                        boxShadow: '2px 2px 12px rgba(0,0,0,0.1)',
                        textAlign: 'center'
                      }}
                    >
                      <img
                        src={item.images && item.images[0] ? item.images[0].url : ''}
                        alt={item.name}
                        style={{ width: '100%', height: 'auto', borderRadius: '4px' }}
                      />
                      <h3 style={{ margin: '10px 0 5px 0' }}>{item.name}</h3>
                      {item.artists && item.artists[0] && (
                        <p style={{ margin: '5px 0', fontSize: '14px' }}>アーティスト: {item.artists[0].name}</p>
                      )}
                      <p style={{ margin: '5px 0', fontSize: '12px' }}>
                        リリース日: {item.release_date}
                      </p>
                      <p style={{ margin: '5px 0', fontSize: '12px' }}>
                        album_type: {item.album_type}
                      </p>
                    </div>
                  ))}
                </div>
              ) : <p>アルバムはありません。</p>}
            </div>
            <div>
              <h3>【シングル】</h3>
              {releases[date].singles.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                  {releases[date].singles.map(item => (
                    <div
                      key={item.id}
                      style={{
                        border: '1px solid #ccc',
                        borderRadius: '8px',
                        padding: '10px',
                        width: '200px',
                        boxShadow: '2px 2px 12px rgba(0,0,0,0.1)',
                        textAlign: 'center'
                      }}
                    >
                      <img
                        src={item.images && item.images[0] ? item.images[0].url : ''}
                        alt={item.name}
                        style={{ width: '100%', height: 'auto', borderRadius: '4px' }}
                      />
                      <h3 style={{ margin: '10px 0 5px 0' }}>{item.name}</h3>
                      {item.artists && item.artists[0] && (
                        <p style={{ margin: '5px 0', fontSize: '14px' }}>アーティスト: {item.artists[0].name}</p>
                      )}
                      <p style={{ margin: '5px 0', fontSize: '12px' }}>
                        リリース日: {item.release_date}
                      </p>
                      <p style={{ margin: '5px 0', fontSize: '12px' }}>
                        album_type: {item.album_type}
                      </p>
                    </div>
                  ))}
                </div>
              ) : <p>シングルはありません。</p>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default App;
