import { VtexAdapter } from './vtex.js';

export class DiscoAdapter extends VtexAdapter {
  constructor() {
    super({ chain: 'disco', displayName: 'Disco', host: 'www.disco.com.ar' });
  }
}
