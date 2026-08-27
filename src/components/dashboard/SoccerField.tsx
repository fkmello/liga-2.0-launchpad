import { CartolaPlayer } from '@/types';
import PlayerBadge from './PlayerBadge';

interface SoccerFieldProps {
  players: CartolaPlayer[];
  capitaoId?: number;
  reservaLuxoId?: number | null;
  esquemaNome?: string;
  esquemaPosicoes?: { gol: number; lat: number; zag: number; mei: number; ata: number; tec: number };
  statusMercado?: number;
  rodadaAtual?: number;
}

const SoccerField = ({ players, capitaoId, reservaLuxoId, esquemaNome, esquemaPosicoes, statusMercado, rodadaAtual }: SoccerFieldProps) => {
  const forwards = players.filter((p) => p.posicao_id === 5);
  const midfielders = players.filter((p) => p.posicao_id === 4);
  
  // Order defenders based on esquema
  const hasLaterais = esquemaPosicoes ? esquemaPosicoes.lat > 0 : true;
  const lats = players.filter((p) => p.posicao_id === 2);
  const zags = players.filter((p) => p.posicao_id === 3);
  const orderedDefenders = hasLaterais
    ? [lats[0], ...zags, lats[1]].filter(Boolean)
    : zags;
  
  const goalkeeper = players.filter((p) => p.posicao_id === 1);
  const coach = players.filter((p) => p.posicao_id === 6);
  const showPartial = statusMercado === 2;
  const showOpenMarket = statusMercado === 1;

  const getPartialScore = (p: CartolaPlayer) => {
    if (!showPartial) return undefined;
    const isCap = capitaoId != null && p.atleta_id === capitaoId;
    // pontuacao already has captain multiplier applied by the edge function
    return p.pontuacao;
  };

  if (players.length === 0) {
    const emptyMessage =
      rodadaAtual === 1 && statusMercado === 1
        ? 'Durante a rodada 1, a escalação só irá aparecer após o fechamento do mercado'
        : 'Nenhum jogador escalado';
    return (
      <div className="mx-3 my-4 rounded-2xl overflow-hidden border-4 border-green-700/50">
        <div className="field-gradient flex items-center justify-center px-6 text-center" style={{ minHeight: '620px' }}>
          <p className="text-white/60 text-sm">{emptyMessage}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-3 my-4 rounded-2xl overflow-hidden border-4 border-green-700/50">
      <div className="field-gradient relative" style={{ minHeight: '620px' }}>
        {/* Field lines SVG */}
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 140" preserveAspectRatio="none">
          <rect x="5" y="5" width="90" height="130" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <line x1="5" y1="70" x2="95" y2="70" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <circle cx="50" cy="70" r="12" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <circle cx="50" cy="70" r="1" fill="rgba(255,255,255,0.4)" />
          <rect x="20" y="5" width="60" height="22" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <rect x="30" y="5" width="40" height="10" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <path d="M 30 27 Q 50 35 70 27" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <rect x="20" y="113" width="60" height="22" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <rect x="30" y="125" width="40" height="10" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <path d="M 30 113 Q 50 105 70 113" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <path d="M 5 8 Q 8 5 11 5" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <path d="M 89 5 Q 95 5 95 11" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <path d="M 5 132 Q 5 135 8 135" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
          <path d="M 95 129 Q 95 135 89 135" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
        </svg>

        <div className="relative z-10 w-full" style={{ minHeight: '620px' }}>
          {/* Formation name or played count */}
          {(esquemaNome || showPartial) && (
            <div className="absolute left-1/2 -translate-x-1/2 z-20" style={{ top: '2%' }}>
              <div className="bg-black/60 px-3 py-1 rounded-sm">
                <span className="text-white text-xs font-medium">
                  {showPartial
                    ? `${players.filter(p => p.game_status === 'played').length}/12`
                    : esquemaNome}
                </span>
              </div>
            </div>
          )}

          {/* Forwards - near top penalty area */}
          <div className="absolute left-0 right-0 flex justify-around items-start px-2" style={{ top: '14%' }}>
            {forwards.map((p) => (
              <PlayerBadge
                key={p.atleta_id}
                name={p.apelido}
                positionId={p.posicao_id}
                club={p.clube_abreviacao}
                price={p.preco_num}
                isCaptain={capitaoId != null && p.atleta_id === capitaoId}
                isReservaLuxo={reservaLuxoId != null && p.atleta_id === reservaLuxoId}
                photoUrl={p.foto}
                clubBadgeUrl={p.clube_escudo}
                statusId={p.status_id}
                partialScore={showOpenMarket ? p.pontuacao : getPartialScore(p)}
                showPartialScore={showPartial}
                variacao={p.variacao_num}
                showOpenMarketLayout={showOpenMarket}
                gameStatus={p.game_status}
                isSubbedIn={p.is_subbed_in}
                isSubbedOut={p.is_subbed_out}
              />
            ))}
          </div>

          {/* Midfielders - at center line */}
          <div className="absolute left-0 right-0 flex justify-around items-start px-2" style={{ top: '38%' }}>
            {midfielders.map((p) => (
              <PlayerBadge
                key={p.atleta_id}
                name={p.apelido}
                positionId={p.posicao_id}
                club={p.clube_abreviacao}
                price={p.preco_num}
                isCaptain={capitaoId != null && p.atleta_id === capitaoId}
                isReservaLuxo={reservaLuxoId != null && p.atleta_id === reservaLuxoId}
                photoUrl={p.foto}
                clubBadgeUrl={p.clube_escudo}
                statusId={p.status_id}
                partialScore={showOpenMarket ? p.pontuacao : getPartialScore(p)}
                showPartialScore={showPartial}
                variacao={p.variacao_num}
                showOpenMarketLayout={showOpenMarket}
                gameStatus={p.game_status}
                isSubbedIn={p.is_subbed_in}
                isSubbedOut={p.is_subbed_out}
              />
            ))}
          </div>

          {/* Defenders - LAT ZAG ZAG LAT, above goalkeeper */}
          <div className="absolute left-0 right-0 flex justify-around items-start px-2" style={{ top: '62%' }}>
            {orderedDefenders.map((p) => (
              <PlayerBadge
                key={p.atleta_id}
                name={p.apelido}
                positionId={p.posicao_id}
                club={p.clube_abreviacao}
                price={p.preco_num}
                isCaptain={capitaoId != null && p.atleta_id === capitaoId}
                isReservaLuxo={reservaLuxoId != null && p.atleta_id === reservaLuxoId}
                photoUrl={p.foto}
                clubBadgeUrl={p.clube_escudo}
                statusId={p.status_id}
                partialScore={showOpenMarket ? p.pontuacao : getPartialScore(p)}
                showPartialScore={showPartial}
                variacao={p.variacao_num}
                showOpenMarketLayout={showOpenMarket}
                gameStatus={p.game_status}
                isSubbedIn={p.is_subbed_in}
                isSubbedOut={p.is_subbed_out}
              />
            ))}
          </div>

          {/* Goalkeeper + Coach */}
          <div className="absolute left-0 right-0 flex justify-center items-start px-2" style={{ top: '82%' }}>
            <div className="absolute left-4">
              {coach.map((p) => (
                <PlayerBadge
                  key={p.atleta_id}
                  name={p.apelido}
                  positionId={p.posicao_id}
                  club={p.clube_abreviacao}
                  price={p.preco_num}
                  isCaptain={capitaoId != null && p.atleta_id === capitaoId}
                  isReservaLuxo={reservaLuxoId != null && p.atleta_id === reservaLuxoId}
                  photoUrl={p.foto}
                  clubBadgeUrl={p.clube_escudo}
                  statusId={p.status_id}
                  partialScore={showOpenMarket ? p.pontuacao : getPartialScore(p)}
                  showPartialScore={showPartial}
                  variacao={p.variacao_num}
                  showOpenMarketLayout={showOpenMarket}
                  gameStatus={p.game_status}
                  isSubbedIn={p.is_subbed_in}
                  isSubbedOut={p.is_subbed_out}
                />
              ))}
            </div>
            {goalkeeper.map((p) => (
              <PlayerBadge
                key={p.atleta_id}
                name={p.apelido}
                positionId={p.posicao_id}
                club={p.clube_abreviacao}
                price={p.preco_num}
                isCaptain={capitaoId != null && p.atleta_id === capitaoId}
                isReservaLuxo={reservaLuxoId != null && p.atleta_id === reservaLuxoId}
                photoUrl={p.foto}
                clubBadgeUrl={p.clube_escudo}
                statusId={p.status_id}
                partialScore={showOpenMarket ? p.pontuacao : getPartialScore(p)}
                showPartialScore={showPartial}
                variacao={p.variacao_num}
                showOpenMarketLayout={showOpenMarket}
                gameStatus={p.game_status}
                isSubbedIn={p.is_subbed_in}
                isSubbedOut={p.is_subbed_out}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SoccerField;
