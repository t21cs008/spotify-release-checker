// src/Login.js
import React, { useState } from 'react';
import { auth } from './firebase';

function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const toggleMode = () => {
    setIsRegister(!isRegister);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (isRegister) {
        await auth.createUserWithEmailAndPassword(email, password);
      } else {
        await auth.signInWithEmailAndPassword(email, password);
      }
    } catch (error) {
      alert(error.message);
    }
  };

  return (
    <div style={styles.container}>
      <h2>{isRegister ? '新規登録' : 'ログイン'}</h2>
      <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.inputGroup}>
          <label>メールアドレス: </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={styles.input}
          />
        </div>
        <div style={styles.inputGroup}>
          <label>パスワード: </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={styles.input}
          />
        </div>
        <button type="submit" style={styles.button}>
          {isRegister ? '登録' : 'ログイン'}
        </button>
      </form>
      <button onClick={toggleMode} style={styles.toggleButton}>
        {isRegister ? '既にアカウントをお持ちですか？ ログイン' : 'アカウントをお持ちでないですか？ 新規登録'}
      </button>
    </div>
  );
}

const styles = {
  container: {
    border: '1px solid #ccc',
    padding: '20px',
    borderRadius: '8px',
    maxWidth: '400px',
    margin: '0 auto',
    backgroundColor: '#fafafa',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  inputGroup: {
    marginBottom: '10px',
  },
  input: {
    width: '100%',
    padding: '8px',
    marginTop: '4px',
    borderRadius: '4px',
    border: '1px solid #ccc',
  },
  button: {
    padding: '10px',
    backgroundColor: '#1db954',
    color: '#fff',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  toggleButton: {
    marginTop: '10px',
    padding: '8px',
    backgroundColor: '#fff',
    color: '#1db954',
    border: '1px solid #1db954',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};

export default Login;
