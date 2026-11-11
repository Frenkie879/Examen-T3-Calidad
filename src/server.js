'use strict';
const { createApp } = require('./app');
const { seed } = require('./db');

const { app, db } = createApp();
seed(db);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`LabTrack escuchando en http://localhost:${port}`);
});

// Apagado ordenado (permite cerrar conexiones y escribir reportes de cobertura).
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => process.exit(0));
}
