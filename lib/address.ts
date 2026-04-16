export function isEthereumAddress(input: string): boolean {
  const s = input.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s);
}
