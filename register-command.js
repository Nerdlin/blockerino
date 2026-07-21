const clientId = '1529076492775194836';
const token = process.argv[2];

if (!token) {
  console.error('\n❌ Ошибка: Вы не указали токен бота!');
  console.error('Использование: node register-command.js ВАШ_ТОКЕН\n');
  process.exit(1);
}

const command = {
  name: 'play',
  description: 'Launch Blockerino Activity!',
  type: 1,
};

console.log('Регистрация слэш-команды в Discord...');

fetch(`https://discord.com/api/v10/applications/${clientId}/commands`, {
  method: 'POST',
  headers: {
    'Authorization': `Bot ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(command)
})
.then(async (res) => {
  if (res.ok) {
    console.log('✅ Команда /play успешно зарегистрирована!');
    console.log('Теперь обновите страницу в Discord Developer Portal.');
  } else {
    const error = await res.json();
    console.error('❌ Ошибка при регистрации:', error);
  }
})
.catch(console.error);
