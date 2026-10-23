import app from './app.js';
import { env } from './config/env.js';
import { startOrphanImageSweep } from './services/image.service.js';

app.listen(env.port, () => {
  console.log(`Server running on http://localhost:${env.port} [${env.nodeEnv}]`);
});

//deletes uploaded images from s3 which are not referenced in the database
startOrphanImageSweep();
