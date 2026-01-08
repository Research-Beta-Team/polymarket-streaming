import { StreamingPlatform } from './streaming-platform';
import './styles.css';

const platform = new StreamingPlatform();
platform.initialize().catch(console.error);

