import express from 'express';
import { router } from './routes.js';
import { providerSelfTest } from './agent.js';

const app = express();
app.use(express.json());
app.use('/api', router);

const port = Number(process.env.PORT) || 4001;
app.listen(port, () => {
  console.log(`SPLIT server listening on http://localhost:${port}`);
  providerSelfTest();
});
