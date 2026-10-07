import { portfolio } from './artworks.js';

export const getCommissionEmail = () => portfolio.profile.email;
export const getCommissionServices = () => portfolio.commissions;
