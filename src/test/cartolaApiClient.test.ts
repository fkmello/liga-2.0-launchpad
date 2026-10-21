import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchTeamRoundScore } from '../../supabase/functions/_shared/providers/cartola-brasileirao/api-client';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Cartola API client — pontuação por rodada', () => {
  it('retorna a pontuação quando a API confirma a rodada solicitada', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ rodada_atual: 31, pontos: 84.75 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTeamRoundScore('50145709', 31)).resolves.toBe(84.75);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/time/id/50145709/31');
  });

  it('ignora a pontuação quando a API devolve outra rodada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ rodada_atual: 30, pontos: 99.5 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(fetchTeamRoundScore('50145709', 31)).resolves.toBeNull();
  });

  it('ignora pontuação quando a resposta não informa a rodada', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ pontos: 88.5 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(fetchTeamRoundScore('50145709', 31)).resolves.toBeNull();
  });

  it('trata ausência de pontuação como null, sem inventar zero', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ rodada_atual: 31, pontos: null }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(fetchTeamRoundScore('50145709', 31)).resolves.toBeNull();
  });

  it('propaga falhas inesperadas após as tentativas de retry', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response('indisponível', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchTeamRoundScore('50145709', 31)).rejects.toThrow(/503/);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
