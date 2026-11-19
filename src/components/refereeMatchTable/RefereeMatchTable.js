import React, { useEffect, useState } from 'react';
import { apiCall } from '@/store/utils';
import { endpoints } from '@/store/urls';
import stl from './RefereeMatchTable.module.scss';
import toast from 'react-hot-toast';
import { Dialog, DialogActions, DialogContent, DialogTitle, Button, TextField, MenuItem } from '@mui/material';
import OutcomeBadge from '@/components/common/OutcomeBadge';
import {
  DECLARABLE_OUTCOMES, declarableOutcomeTypes, formatResult, getOutcomeDisplay, hasScores
} from '@/utils/matchOutcome';

// A declared outcome needs both teams decided (knockout slots start as "TBD")
const hasBothTeams = (match) =>
  [match.team1?.team_id, match.team2?.team_id].every(id => id && id !== 'TBD');

const RefereeMatchTable = ({ tournamentId }) => {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingMatch, setEditingMatch] = useState(null);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);
  const [scores, setScores] = useState({ team1Score: 0, team2Score: 0 });
  const [modalType, setModalType] = useState('start'); // 'start', 'completed' or 'declaration'
  const [declaration, setDeclaration] = useState({ type: null, winnerTeamId: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchMatches = async () => {
      try {
        setLoading(true);
        const response = await apiCall(endpoints.getFixtures, {
          params: { tournament_id: tournamentId }
        });

        if (response && response.matches) {
          setMatches(response.matches);
        }
      } catch (error) {
        console.error('Failed to fetch matches:', error);
        toast.error('Failed to load matches');
      } finally {
        setLoading(false);
      }
    };

    if (tournamentId) {
      fetchMatches();
    }
  }, [tournamentId]);

  const handleStartMatch = async (match) => {
    try {
      await apiCall(`${endpoints.updateMatchStatus}/${match.match_id}`, {
        method: "POST",
        body: {
          tournament_id: tournamentId,
          status: "on-going"
        }
      });
      
      // Update local state
      setMatches(matches.map(m => 
        m.match_id === match.match_id 
          ? { ...m, match_status: { ...m.match_status, status: 'on-going' }} 
          : m
      ));
      
      toast.success("Match started successfully");
    } catch (error) {
      console.error("Failed to start match:", error);
      toast.error(error.message || "Failed to start match");
    }
  };

  const handleScoreUpdate = async (match, isFinal = false, override = false) => {
    try {
      const requestBody = {
        tournament_id: tournamentId,
        match_id: match.match_id,
        score: `${scores.team1Score}-${scores.team2Score}`,
        final: isFinal,
        override: override
      };

      const scorePromise = fetch(endpoints.updateMatchScore, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestBody),
      });

      const statusPromise = isFinal ? 
        apiCall(`${endpoints.updateMatchStatus}/${match.match_id}`, {
          method: "POST",
          body: {
            tournament_id: tournamentId,
            status: "completed"
          }
        }) : Promise.resolve();

      const [response] = await Promise.all([scorePromise, statusPromise]);
      const resp = await response.json();

      if (!response.ok) {
        if (response.status === 400 && resp.error?.includes("already been finalized")) {
          const shouldOverride = window.confirm("Match is already finalized. Would you like to override?");
          if (shouldOverride) {
            return handleScoreUpdate(match, isFinal, true);
          }
        }
        throw new Error(resp.error || 'Failed to update score');
      }

      // Update local state
      setMatches(matches.map(m => {
        if (m.match_id === match.match_id) {
          return {
            ...m,
            match_result: `${scores.team1Score}-${scores.team2Score}`,
            match_status: isFinal 
              ? { ...m.match_status, status: 'completed', is_final: true }
              : m.match_status
          };
        }
        return m;
      }));

      setEditingMatch(null);
      toast.success(isFinal ? 'Match finalized successfully' : 'Score updated successfully');
    } catch (error) {
      console.error('Failed to update score:', error);
      toast.error(error.message || 'Failed to update score');
    }
  };

  const handleEditClick = (match) => {
    if (match.match_status.status === 'completed') {
      setSelectedMatch(match);
      setModalType('completed');
      setShowStatusModal(true);
      return;
    }

    const [team1Score, team2Score] = match.match_result.split('-').map(Number);
    setScores({ team1Score: team1Score || 0, team2Score: team2Score || 0 });
    setEditingMatch(match);
  };

  const handleStartMatchClick = (match) => {
    setSelectedMatch(match);
    setModalType('start');
    setShowStatusModal(true);
  };

  const handleDeclareClick = (match, type) => {
    setSelectedMatch(match);
    setDeclaration({ type, winnerTeamId: '', reason: '' });
    setModalType('declaration');
    setShowStatusModal(true);
  };

  const handleDeclareOutcome = async () => {
    const type = declaration.type;
    const label = getOutcomeDisplay({ type })?.label || type;
    try {
      setSubmitting(true);
      const response = await apiCall(`${endpoints.declareOutcome}/${selectedMatch.match_id}`, {
        method: "POST",
        body: {
          tournament_id: tournamentId,
          outcome: type,
          winner_team_id: declaration.winnerTeamId,
          reason: declaration.reason || null
        }
      });

      // Update local state from the server's view of the match
      const updated = response.match;
      setMatches(matches.map(m =>
        m.match_id === updated.id
          ? {
              ...m,
              match_status: {
                ...m.match_status,
                status: updated.status,
                is_final: updated.is_final,
                winner_team_id: updated.winner_team_id
              },
              outcome: updated.outcome
            }
          : m
      ));

      setShowStatusModal(false);
      toast.success(response.message || `${label} declared`);
    } catch (error) {
      console.error(`Failed to declare ${label}:`, error);
      toast.error(error.message || `Failed to declare ${label}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className={stl.loading}>Loading matches...</div>;
  }

  return (
    <div className={stl.container}>
      <div className={stl.tableWrapper}>
        <table className={stl.table}>
          <thead>
            <tr>
              <th>Match ID</th>
              <th>Round</th>
              <th>Pool</th>
              <th>Team 1</th>
              <th>Team 2</th>
              <th>Result</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((match) => (
              <tr key={match.match_id}>
                <td>{match.match_id}</td>
                <td>{match.round_name || `Round ${match.round_id}`}</td>
                <td>{match.pool || '-'}</td>
                <td>{match.team1_players}</td>
                <td>{match.team2_players}</td>
                <td>
                  {editingMatch?.match_id === match.match_id ? (
                    <div className={stl.scoreInputs}>
                      <TextField
                        size="small"
                        type="number"
                        value={scores.team1Score}
                        onChange={(e) => setScores({ ...scores, team1Score: Math.max(0, parseInt(e.target.value) || 0) })}
                      />
                      <span>-</span>
                      <TextField
                        size="small"
                        type="number"
                        value={scores.team2Score}
                        onChange={(e) => setScores({ ...scores, team2Score: Math.max(0, parseInt(e.target.value) || 0) })}
                      />
                    </div>
                  ) : (
                    formatResult(match)
                  )}
                </td>
                <td>
                  <span className={`${stl.status} ${stl[match.match_status.status]}`}>
                    {match.match_status.status}
                  </span>
                  {' '}<OutcomeBadge outcome={match.outcome} />
                </td>
                <td>
                  {match.match_status.status === 'pending' && (
                    <div className={stl.actionButtons}>
                      <button 
                        onClick={() => handleStartMatchClick(match)}
                        className={stl.startButton}
                      >
                        Start Match
                      </button>
                      {hasBothTeams(match) && declarableOutcomeTypes().map((type) => (
                        <button
                          key={type}
                          onClick={() => handleDeclareClick(match, type)}
                          className={stl.outcomeButton}
                        >
                          {getOutcomeDisplay({ type })?.label || type}
                        </button>
                      ))}
                    </div>
                  )}
                  {match.match_status.status === 'on-going' && (
                    editingMatch?.match_id === match.match_id ? (
                      <div className={stl.actionButtons}>
                        <button 
                          onClick={() => handleScoreUpdate(match)}
                          className={stl.updateButton}
                        >
                          Update
                        </button>
                        <button 
                          onClick={() => handleScoreUpdate(match, true)}
                          className={stl.finalizeButton}
                        >
                          Finalize
                        </button>
                        <button 
                          onClick={() => setEditingMatch(null)}
                          className={stl.cancelButton}
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => handleEditClick(match)}
                        className={stl.editButton}
                      >
                        Edit Score
                      </button>
                    )
                  )}
                  {match.match_status.status === 'completed' && hasScores(match.outcome) && (
                    <button 
                      onClick={() => handleEditClick(match)}
                      className={stl.editButton}
                    >
                      Override Score
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog 
        open={showStatusModal} 
        onClose={() => setShowStatusModal(false)}
      >
        <DialogTitle>
          {modalType === 'start'
            ? 'Start Match'
            : modalType === 'declaration'
              ? `Declare ${getOutcomeDisplay({ type: declaration.type })?.label || declaration.type}`
              : 'Match Completed'}
        </DialogTitle>
        <DialogContent>
          {modalType === 'start' ? (
            <p>Are you sure you want to start this match?</p>
          ) : modalType === 'declaration' ? (
            <div className={stl.declarationForm}>
              <p>{DECLARABLE_OUTCOMES[declaration.type]?.help}</p>
              <TextField
                select
                size="small"
                label="Winner"
                value={declaration.winnerTeamId}
                onChange={(e) => setDeclaration({ ...declaration, winnerTeamId: e.target.value })}
              >
                {selectedMatch && [
                  { id: selectedMatch.team1?.team_id, players: selectedMatch.team1_players },
                  { id: selectedMatch.team2?.team_id, players: selectedMatch.team2_players }
                ].map(team => (
                  <MenuItem key={team.id} value={team.id}>
                    {team.id} - {team.players}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                size="small"
                label="Reason (optional)"
                placeholder="e.g. Opponent did not show up"
                value={declaration.reason}
                inputProps={{ maxLength: 255 }}
                onChange={(e) => setDeclaration({ ...declaration, reason: e.target.value })}
              />
            </div>
          ) : (
            <p>This match has been completed. Would you like to override the scores?</p>
          )}
        </DialogContent>
        <DialogActions>
          <Button 
            onClick={() => setShowStatusModal(false)}
            style={{ color: '#F28C28' }}
          >
            Cancel
          </Button>
          {modalType === 'declaration' ? (
            <Button
              onClick={handleDeclareOutcome}
              disabled={!declaration.winnerTeamId || submitting}
              style={{ color: declaration.winnerTeamId && !submitting ? '#4CAF50' : undefined }}
            >
              Declare {getOutcomeDisplay({ type: declaration.type })?.label || declaration.type}
            </Button>
          ) : modalType === 'start' ? (
            <Button 
              onClick={() => {
                handleStartMatch(selectedMatch);
                setShowStatusModal(false);
              }}
              style={{ color: '#4CAF50' }}
            >
              Start Match
            </Button>
          ) : (
            <Button 
              onClick={() => {
                const [team1Score, team2Score] = selectedMatch.match_result.split('-').map(Number);
                setScores({ team1Score: team1Score || 0, team2Score: team2Score || 0 });
                setEditingMatch(selectedMatch);
                setShowStatusModal(false);
              }}
              style={{ color: '#4CAF50' }}
            >
              Override Score
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default RefereeMatchTable; 