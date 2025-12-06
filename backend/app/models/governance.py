"""Governance models"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey, Text, JSON
from sqlalchemy.orm import relationship

from app.models.database import Base


class Proposal(Base):
    """Governance proposal"""
    __tablename__ = "proposals"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    on_chain_address = Column(String(44), nullable=False, unique=True)
    proposal_number = Column(Integer, nullable=False)
    proposer = Column(String(44), nullable=False, index=True)
    action_type = Column(String(50), nullable=False)
    action_data = Column(JSON, nullable=False)
    description = Column(Text, nullable=True)
    votes_for = Column(BigInteger, default=0)
    votes_against = Column(BigInteger, default=0)
    votes_abstain = Column(BigInteger, default=0)
    status = Column(String(20), nullable=False)  # pending, active, passed, failed, executed, cancelled
    voting_starts = Column(DateTime, nullable=False)
    voting_ends = Column(DateTime, nullable=False)
    execution_delay_seconds = Column(BigInteger, nullable=False)
    executed_at = Column(DateTime, nullable=True)
    snapshot_slot = Column(BigInteger, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    token = relationship("Token", back_populates="proposals")
    votes = relationship("VoteRecord", back_populates="proposal", lazy="dynamic")

    @property
    def total_votes(self) -> int:
        return self.votes_for + self.votes_against + self.votes_abstain

    @property
    def approval_percentage(self) -> float:
        total = self.votes_for + self.votes_against
        if total == 0:
            return 0.0
        return (self.votes_for / total) * 100

    def __repr__(self):
        return f"<Proposal {self.proposal_number} ({self.status})>"


class VoteRecord(Base):
    """Vote record"""
    __tablename__ = "votes"

    id = Column(Integer, primary_key=True, autoincrement=True)
    token_id = Column(Integer, ForeignKey("tokens.token_id"), nullable=False, index=True)
    proposal_id = Column(Integer, ForeignKey("proposals.id"), nullable=False, index=True)
    voter = Column(String(44), nullable=False, index=True)
    vote = Column(String(10), nullable=False)  # for, against, abstain
    weight = Column(BigInteger, nullable=False)
    voted_at = Column(DateTime, default=datetime.utcnow)
    signature = Column(String(88), nullable=False)

    # Relationships
    proposal = relationship("Proposal", back_populates="votes")

    def __repr__(self):
        return f"<VoteRecord {self.voter[:8]}... ({self.vote})>"
