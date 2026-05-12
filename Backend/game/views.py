
# from rest_framework import viewsets, status
# from rest_framework.decorators import action
# from rest_framework.response import Response
# from rest_framework.permissions import AllowAny
# from django.shortcuts import get_object_or_404
# from django.db.models import Q, Count
# from django.core.cache import cache
# from .models import Game, Player, GameSummary, GameCommentary
# from .serializers import ( 
#     GameEventSerializer, GameSummarySerializer,
#     GameDetailSerializer, GameListSerializer,
#     GameCommentarySerializer,
# )
# import google.generativeai as genai
# import os
# import json

# # Configure Gemini
# genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

# class GameViewSet(viewsets.ReadOnlyModelViewSet):
#     """
#     Read-only viewset for games with AI-powered features using Gemini
#     """
#     permission_classes = [AllowAny]
    
#     def get_serializer_class(self):
#         if self.action == 'retrieve':
#             return GameDetailSerializer
#         return GameListSerializer
    
#     def get_queryset(self):
#         queryset = Game.objects.all().prefetch_related('players', 'events')
        
#         status_filter = self.request.query_params.get('status', None)
#         if status_filter is not None:
#             queryset = queryset.filter(status=int(status_filter))
        
#         wallet = self.request.query_params.get('wallet', None)
#         if wallet:
#             queryset = queryset.filter(players__wallet_address=wallet)
        
#         return queryset.order_by('-created_at')
    
#     @action(detail=True, methods=['get'])
#     def events(self, request, pk=None):
#         """
#         Get all events for a specific game
        
#         Query Parameters:
#         - type: Filter by event type (optional)
        
#         Returns: List of game events
#         """
#         game = self.get_object()
#         events = game.events.all()
        
#         event_type = request.query_params.get('type', None)
#         if event_type:
#             events = events.filter(event_type=event_type)
        
#         serializer = GameEventSerializer(events, many=True)
#         return Response(serializer.data)
    
#     @action(detail=True, methods=['post'])
#     def generate_live_commentary(self, request, pk=None):
#         """
#         Generate AI-powered live commentary for current game state
        
#         Method: POST
#         Endpoint: /api/games/{game_id}/generate_live_commentary/
        
#         Request Body: None
        
#         Response:
#         {
#             "id": 123,
#             "game": 1,
#             "round_number": 5,
#             "commentary_text": "The tension rises as...",
#             "commentary_type": "live",
#             "tension_level": 8,
#             "context_data": {...},
#             "created_at": "2025-10-13T12:00:00Z"
#         }
        
#         Errors:
#         - 400: Game not active
#         - 500: AI generation failed
#         """
#         game = self.get_object()
        
#         if game.is_completed:
#             return Response(
#                 {'error': 'Cannot generate commentary for completed game'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         try:
#             players = game.players.all().order_by('joined_at')
#             recent_events = game.events.all().order_by('-block_height')[:5]
            
#             active_players = players.filter(eliminated=False).count()
#             eliminated_players = players.filter(eliminated=True).count()
            
#             recent_actions = []
#             for event in recent_events:
#                 recent_actions.append({
#                     'type': event.get_event_type_display(),
#                     'round': event.event_data.get('round', '?'),
#                     'player': event.player_address[:8] + '...' if event.player_address else 'N/A'
#                 })
            
#             tension_level = self._calculate_tension_level(game, active_players)
            
#             game_context = f"""
#                 Current Game State:
#                 - Game ID: {game.game_id}
#                 - Current Round: {game.current_round}
#                 - Players Remaining: {active_players} of {players.count()}
#                 - Prize Pool: {game.prize_pool} STX
#                 - Tension Level: {tension_level}/10

#                 Recent Actions (last 5):
#                 {chr(10).join([f"Round {a['round']}: {a['type']} - {a['player']}" for a in recent_actions])}

#                 Active Players:
#                 {chr(10).join([f"- {p.wallet_address[:12]}... {'(Risk Mode Active)' if p.used_risk_mode else ''}" for p in players.filter(eliminated=False)])}
#                 """
            
#             # Use Gemini Flash for fast, cost-effective commentary
#             model = genai.GenerativeModel('gemini-1.5-pro')

            
#             prompt = f"""You are a live sports commentator for a blockchain Russian Roulette game. 
#                 Provide exciting, real-time commentary on the current game state.

#                 Style: Energetic, suspenseful, focus on the drama of the moment.
#                 Keep it to 2-3 punchy sentences about what's happening RIGHT NOW.
#                 Make it feel like a live broadcast.

#                 {game_context}

#                 Commentary:"""
            
#             response = model.generate_content(prompt)
#             commentary_text = response.text
            
#             commentary = GameCommentary.objects.create(
#                 game=game,
#                 round_number=game.current_round,
#                 commentary_text=commentary_text,
#                 commentary_type='live',
#                 tension_level=tension_level,
#                 context_data={
#                     'active_players': active_players,
#                     'recent_events': recent_actions,
#                     'prize_pool': str(game.prize_pool)
#                 }
#             )
            
#             serializer = GameCommentarySerializer(commentary)
#             return Response(serializer.data, status=status.HTTP_201_CREATED)
            
#         except Exception as e:
#             return Response(
#                 {'error': f'Failed to generate commentary: {str(e)}'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
    
#     @action(detail=True, methods=['get'])
#     def commentaries(self, request, pk=None):
#         """
#         Get all AI commentaries for a game
        
#         Method: GET
#         Endpoint: /api/games/{game_id}/commentaries/
        
#         Query Parameters:
#         - type: Filter by commentary type (live, prediction, analysis, highlight)
#         - limit: Number of commentaries to return (default: 10)
        
#         Response:
#         [
#             {
#                 "id": 123,
#                 "round_number": 5,
#                 "commentary_text": "...",
#                 "commentary_type": "live",
#                 "tension_level": 8,
#                 "created_at": "..."
#             },
#             ...
#         ]
#         """
#         game = self.get_object()
#         commentaries = GameCommentary.objects.filter(game=game)
        
#         commentary_type = request.query_params.get('type', None)
#         if commentary_type:
#             commentaries = commentaries.filter(commentary_type=commentary_type)
        
#         limit = int(request.query_params.get('limit', 10))
#         commentaries = commentaries.order_by('-created_at')[:limit]
        
#         serializer = GameCommentarySerializer(commentaries, many=True)
#         return Response(serializer.data)
    
#     @action(detail=True, methods=['post'])
#     def generate_summary(self, request, pk=None):
#         """
#         Generate comprehensive AI summary for completed game
        
#         Method: POST
#         Endpoint: /api/games/{game_id}/generate_summary/
        
#         Request Body: None
        
#         Response:
#         {
#             "id": 456,
#             "game": 1,
#             "ai_summary": "In a battle of nerves and luck...",
#             "total_rounds": 12,
#             "total_spins": 48,
#             "elimination_order": [...],
#             "key_moments": [...],
#             "statistics": {
#                 "average_spins_per_round": 4.0,
#                 "shield_uses": 3,
#                 "risk_mode_uses": 2,
#                 "survival_rate": 16.67
#             },
#             "excitement_rating": 9,
#             "generated_at": "2025-10-13T12:00:00Z"
#         }
        
#         Errors:
#         - 400: Game not completed
#         - 200: Summary already exists (returns existing)
#         - 500: AI generation failed
#         """
#         game = self.get_object()
        
#         if not game.is_completed:
#             return Response(
#                 {'error': 'Game must be completed to generate summary'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         if hasattr(game, 'summary'):
#             serializer = GameSummarySerializer(game.summary)
#             return Response(
#                 {
#                     'message': 'Summary already exists',
#                     'data': serializer.data
#                 },
#                 status=status.HTTP_200_OK
#             )
        
#         try:
#             players = game.players.all().order_by('joined_at')
#             events = game.events.all().order_by('block_height')
            
#             elimination_order = []
#             for player in players.filter(eliminated=True).order_by('eliminated_round'):
#                 elimination_order.append({
#                     'address': player.wallet_address,
#                     'round': player.eliminated_round
#                 })
            
#             total_spins = events.filter(
#                 event_type__in=['player_survived', 'player_eliminated']
#             ).count()
            
#             timeline = []
#             for event in events[:50]:  # Limit to first 50 events
#                 event_desc = f"Round {event.event_data.get('round', '?')}: {event.get_event_type_display()}"
#                 if event.player_address:
#                     event_desc += f" - {event.player_address[:8]}..."
#                 timeline.append(event_desc)
            
#             game_context = f"""
#                 Game Summary Data:
#                 - Game ID: {game.game_id}
#                 - Stake Amount: {game.stake_amount} STX per player
#                 - Total Prize Pool: {game.prize_pool} STX
#                 - Total Players: {players.count()}
#                 - Total Rounds: {game.current_round}
#                 - Total Spins: {total_spins}
#                 - Winner: {game.winner_address[:10] if game.winner_address else 'N/A'}...

#                 Players (in join order):
#                 {chr(10).join([f'{i+1}. {p.wallet_address[:10]}... {"🏆 WINNER" if p.wallet_address == game.winner_address else f"💀 Eliminated Round {p.eliminated_round}" if p.eliminated else ""}' for i, p in enumerate(players)])}

#                 Game Timeline:
#                 {chr(10).join(timeline)}

#                 Elimination Order:
#                 {chr(10).join([f"{i+1}. {e['address'][:10]}... - Round {e['round']}" for i, e in enumerate(elimination_order)])}
#                 """
            
#             model = genai.GenerativeModel('gemini-1.5-pro')
            
#             prompt = f"""You are a master storyteller recounting an epic Russian Roulette game on the Stacks blockchain. 
#                     Write a compelling narrative summary that captures the full arc of this game.

#                     Structure your response:
#                     1. **The Setup** - Set the stakes and introduce the battle (2-3 sentences)
#                     2. **Rising Action** - Chronicle key eliminations and tense moments (3-4 sentences)
#                     3. **The Climax** - Build to the final showdown (2-3 sentences)
#                     4. **The Resolution** - Winner announcement and reflection (2 sentences)
#                     5. **Strategy Analysis** - Brief tactical insights (2-3 sentences)

#                     {game_context}

#                     Write in an engaging, dramatic style. Use metaphors from poker, warfare, or gladiatorial combat.
#                     Keep it under 400 words. Make readers feel the tension and excitement."""
                                
#             response = model.generate_content(prompt)
#             ai_summary = response.text
            
#             key_moments = self._extract_key_moments(events, players, game)
            
#             statistics = {
#                 'average_spins_per_round': round(total_spins / game.current_round, 2) if game.current_round > 0 else 0,
#                 'shield_uses': events.filter(event_type='shield_used').count(),
#                 'risk_mode_uses': players.filter(used_risk_mode=True).count(),
#                 'survival_rate': round((1 / players.count()) * 100, 2) if players.count() > 0 else 0,
#                 'longest_game_duration': game.current_round,
#                 'total_prize_pool': str(game.prize_pool)
#             }
            
#             excitement_rating = self._calculate_excitement_rating(
#                 game.current_round,
#                 players.count(),
#                 key_moments,
#                 total_spins
#             )
            
#             summary = GameSummary.objects.create(
#                 game=game,
#                 ai_summary=ai_summary,
#                 total_rounds=game.current_round,
#                 total_spins=total_spins,
#                 elimination_order=elimination_order,
#                 key_moments=key_moments,
#                 statistics=statistics,
#                 excitement_rating=excitement_rating
#             )
            
#             serializer = GameSummarySerializer(summary)
#             return Response(serializer.data, status=status.HTTP_201_CREATED)
            
#         except Exception as e:
#             return Response(
#                 {'error': f'Failed to generate summary: {str(e)}'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
    
#     @action(detail=True, methods=['get'])
#     def summary(self, request, pk=None):
#         """
#         Get existing AI summary for a game
        
#         Method: GET
#         Endpoint: /api/games/{game_id}/summary/
        
#         Response: GameSummary object (see generate_summary for structure)
        
#         Errors:
#         - 404: No summary found
#         """
#         game = self.get_object()
        
#         if not hasattr(game, 'summary'):
#             return Response(
#                 {'error': 'No summary found. Generate one first using POST /api/games/{id}/generate_summary/'},
#                 status=status.HTTP_404_NOT_FOUND
#             )
        
#         serializer = GameSummarySerializer(game.summary)
#         return Response(serializer.data)
    
#     @action(detail=True, methods=['post'])
#     def predict_outcome(self, request, pk=None):
#         """
#         AI-powered prediction of game outcome
        
#         Method: POST
#         Endpoint: /api/games/{game_id}/predict_outcome/
        
#         Request Body: None
        
#         Response:
#         {
#             "game_id": 1,
#             "round": 5,
#             "predictions": [
#                 {
#                     "player": "SP2J6Z...",
#                     "win_probability": 45.5,
#                     "reasoning": "Strong survival rate, conservative play"
#                 },
#                 ...
#             ],
#             "next_elimination": {
#                 "player": "SP9M2N...",
#                 "likelihood": "High",
#                 "reasoning": "Weakest position"
#             },
#             "rounds_remaining": 3,
#             "confidence_level": "medium"
#         }
        
#         Errors:
#         - 400: Game already completed
#         - 500: Prediction failed
        
#         Note: Results are cached for 5 minutes per round
#         """
#         game = self.get_object()
        
#         if game.is_completed:
#             return Response(
#                 {'error': 'Game already completed'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         try:
#             cache_key = f'game_prediction_{game.game_id}_{game.current_round}'
#             cached_prediction = cache.get(cache_key)
            
#             if cached_prediction:
#                 return Response(cached_prediction)
            
#             players = game.players.filter(eliminated=False)
#             events = game.events.all()
            
#             player_stats = []
#             for player in players:
#                 player_events = events.filter(player_address=player.wallet_address)
#                 survival_count = player_events.filter(event_type='player_survived').count()
                
#                 player_stats.append({
#                     'address': player.wallet_address[:10] + '...',
#                     'full_address': player.wallet_address,
#                     'survival_count': survival_count,
#                     'risk_mode_active': player.used_risk_mode,
#                     'position': list(players).index(player) + 1
#                 })
            
#             context = f"""
#                 Analyze this Russian Roulette game and predict outcomes.

#                 Current Game State:
#                 - Round: {game.current_round}
#                 - Players Remaining: {players.count()}
#                 - Prize Pool: {game.prize_pool} STX

#                 Player Statistics:
#                 {chr(10).join([f"Player {p['address']}: {p['survival_count']} survivals, Risk Mode: {p['risk_mode_active']}, Position: {p['position']}" for p in player_stats])}

#                 Provide predictions in JSON format with:
#                 1. win_probability for each player (percentages that sum to 100)
#                 2. reasoning for each player's chances
#                 3. most_likely_next_elimination with player and reasoning
#                 4. estimated_rounds_remaining
#                 5. confidence_level (low/medium/high)
#                 """
            
#             # model = genai.GenerativeModel(
#             #     'gemini-1.5-flash',
#             #     generation_config={
#             #         "response_mime_type": "application/json"
#             #     }
#             # )
#             model = genai.GenerativeModel(
#                 'gemini-1.5-flash-latest',
#                 generation_config={
#                     "response_mime_type": "application/json"
#                 }
#             )

            
#             response = model.generate_content(context)
#             prediction_json = json.loads(response.text)
            
#             prediction_data = {
#                 'game_id': game.game_id,
#                 'round': game.current_round,
#                 'predictions': prediction_json.get('predictions', []),
#                 'next_elimination': prediction_json.get('next_elimination', {}),
#                 'rounds_remaining': prediction_json.get('rounds_remaining', 0),
#                 'confidence_level': prediction_json.get('confidence_level', 'medium'),
#                 'generated_at': game.current_round
#             }
            
#             cache.set(cache_key, prediction_data, 300)  
            
#             return Response(prediction_data, status=status.HTTP_200_OK)
            
#         except Exception as e:
#             return Response(
#                 {'error': f'Failed to generate prediction: {str(e)}'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
    
#     @action(detail=False, methods=['post'])
#     def compare_strategies(self, request):
#         """
#         Compare strategies of multiple players
        
#         Method: POST
#         Endpoint: /api/games/compare_strategies/
        
#         Request Body:
#         {
#             "wallets": ["SP2J6ZY...", "SP1K8DH...", "SP9M2NQ..."]
#         }
        
#         Response:
#         {
#             "player_stats": [
#                 {
#                     "wallet": "SP2J6Z...",
#                     "games_played": 15,
#                     "wins": 3,
#                     "win_rate": 20.0,
#                     "risk_mode_usage": 5,
#                     "average_survival_rounds": 4.2
#                 },
#                 ...
#             ],
#             "ai_analysis": "Player comparison analysis...",
#             "head_to_head_prediction": "SP2J6Z... most likely to win"
#         }
        
#         Errors:
#         - 400: Less than 2 wallets provided
#         - 500: Analysis failed
#         """
#         wallet_addresses = request.data.get('wallets', [])
        
#         if not wallet_addresses or len(wallet_addresses) < 2:
#             return Response(
#                 {'error': 'Provide at least 2 wallet addresses to compare'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         try:
#             player_analyses = []
            
#             for wallet in wallet_addresses[:6]:  # Limit to 6 players
#                 games = Game.objects.filter(players__wallet_address=wallet)
#                 player_data = Player.objects.filter(wallet_address=wallet)
                
#                 total_games = games.count()
#                 wins = games.filter(winner_address=wallet).count()
                
#                 analysis = {
#                     'wallet': wallet[:10] + '...',
#                     'full_wallet': wallet,
#                     'games_played': total_games,
#                     'wins': wins,
#                     'win_rate': round((wins / total_games * 100), 2) if total_games > 0 else 0,
#                     'risk_mode_usage': player_data.filter(used_risk_mode=True).count(),
#                     'average_survival_rounds': round(
#                         sum([p.eliminated_round or 0 for p in player_data]) / total_games, 2
#                     ) if total_games > 0 else 0
#                 }
#                 player_analyses.append(analysis)
            
#                 context = f"""
#                     Compare these Russian Roulette players' performance and strategies:

#                     {chr(10).join([f"Player {p['wallet']}:{chr(10)}- Games: {p['games_played']}, Wins: {p['wins']} ({p['win_rate']}%){chr(10)}- Risk Mode Usage: {p['risk_mode_usage']} times{chr(10)}- Avg Survival: {p['average_survival_rounds']} rounds{chr(10)}" for p in player_analyses])}

#                     Provide:
#                     1. Strategic assessment of each player
#                     2. Strengths and weaknesses comparison
#                     3. Head-to-head matchup prediction
#                     4. Strategy recommendations

#                     Be insightful like a professional analyst.
#                     """
            
#             model = genai.GenerativeModel('gemini-1.5-flash')
#             response = model.generate_content(context)
            
#             return Response({
#                 'player_stats': player_analyses,
#                 'ai_analysis': response.text
#             }, status=status.HTTP_200_OK)
            
#         except Exception as e:
#             return Response(
#                 {'error': f'Failed to compare strategies: {str(e)}'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
    
#     def _calculate_tension_level(self, game, active_players):
#         """Calculate tension level 1-10"""
#         total_players = game.players.count()
#         rounds = game.current_round
        
#         player_factor = (1 - (active_players / total_players)) * 5
#         round_factor = min(rounds / 10, 1) * 3
        
#         recent_eliminations = game.events.filter(
#             event_type='player_eliminated'
#         ).order_by('-block_height')[:2].count()
        
#         elimination_factor = recent_eliminations * 1
        
#         return min(round(player_factor + round_factor + elimination_factor), 10)
    
#     def _extract_key_moments(self, events, players, game):
#         """Extract significant game moments"""
#         key_moments = []
        
#         for shield_event in events.filter(event_type='shield_used'):
#             key_moments.append({
#                 'type': 'shield_used',
#                 'round': shield_event.event_data.get('round'),
#                 'player': shield_event.player_address[:10] + '...',
#                 'impact': 'high'
#             })
        
#         first_elim = events.filter(event_type='player_eliminated').first()
#         if first_elim:
#             key_moments.append({
#                 'type': 'first_blood',
#                 'round': first_elim.event_data.get('round'),
#                 'player': first_elim.player_address[:10] + '...',
#                 'impact': 'medium'
#             })
        
#         eliminations = list(events.filter(event_type='player_eliminated').order_by('block_height'))
#         for i in range(len(eliminations) - 1):
#             round_diff = eliminations[i+1].event_data.get('round', 0) - eliminations[i].event_data.get('round', 0)
#             if round_diff <= 1:
#                 key_moments.append({
#                     'type': 'rapid_eliminations',
#                     'round': eliminations[i].event_data.get('round'),
#                     'impact': 'high'
#                 })
#                 break
        
#         return key_moments
    
#     def _calculate_excitement_rating(self, rounds, player_count, key_moments, total_spins):
#         """Calculate excitement rating 1-10"""
#         base_score = 5
        
#         if rounds > 10:
#             base_score += 2
#         elif rounds > 5:
#             base_score += 1
        
#         if player_count > 5:
#             base_score += 1
        
#         high_impact = len([m for m in key_moments if m.get('impact') == 'high'])
#         base_score += min(high_impact, 2)
        
#         return min(base_score, 10)


# class GameSummaryViewSet(viewsets.ReadOnlyModelViewSet):
#     """
#     ViewSet for browsing game summaries
    
#     Endpoints:
#     - GET /api/summaries/ - List all summaries
#     - GET /api/summaries/{id}/ - Get specific summary
    
#     Query Parameters:
#     - wallet: Filter by player wallet address
#     """
#     queryset = GameSummary.objects.all().select_related('game')
#     serializer_class = GameSummarySerializer
#     permission_classes = [AllowAny]
    
#     def get_queryset(self):
#         queryset = super().get_queryset()
        
#         wallet = self.request.query_params.get('wallet', None)
#         if wallet:
#             queryset = queryset.filter(game__players__wallet_address=wallet)
        
#         return queryset.order_by('-generated_at')


# from rest_framework import viewsets, status
# from rest_framework.decorators import action
# from rest_framework.response import Response
# from rest_framework.permissions import AllowAny
# from django.shortcuts import get_object_or_404
# from django.db.models import Q, Count
# from django.core.cache import cache
# from .models import Game, Player, GameSummary, GameCommentary
# from .serializers import ( 
#     GameEventSerializer, GameSummarySerializer,
#     GameDetailSerializer, GameListSerializer,
#     GameCommentarySerializer,
# )
# import google.generativeai as genai
# import os
# import json

# # Configure Gemini
# genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))

# class GameViewSet(viewsets.ReadOnlyModelViewSet):
#     """
#     Read-only viewset for games with AI-powered features using Gemini
#     """
#     permission_classes = [AllowAny]
    
#     def get_serializer_class(self):
#         if self.action == 'retrieve':
#             return GameDetailSerializer
#         return GameListSerializer
    
#     def get_queryset(self):
#         queryset = Game.objects.all().prefetch_related('players', 'events')
        
#         status_filter = self.request.query_params.get('status', None)
#         if status_filter is not None:
#             queryset = queryset.filter(status=int(status_filter))
        
#         wallet = self.request.query_params.get('wallet', None)
#         if wallet:
#             queryset = queryset.filter(players__wallet_address=wallet)
        
#         return queryset.order_by('-created_at')
    
#     @action(detail=True, methods=['get'])
#     def events(self, request, pk=None):
#         """
#         Get all events for a specific game
        
#         Query Parameters:
#         - type: Filter by event type (optional)
        
#         Returns: List of game events
#         """
#         game = self.get_object()
#         events = game.events.all()
        
#         event_type = request.query_params.get('type', None)
#         if event_type:
#             events = events.filter(event_type=event_type)
        
#         serializer = GameEventSerializer(events, many=True)
#         return Response(serializer.data)
    
#     @action(detail=True, methods=['post'])
#     def generate_live_commentary(self, request, pk=None):
#         """
#         Generate AI-powered live commentary for current game state
        
#         Method: POST
#         Endpoint: /api/games/{game_id}/generate_live_commentary/
        
#         Request Body: None
        
#         Response:
#         {
#             "id": 123,
#             "game": 1,
#             "round_number": 5,
#             "commentary_text": "The tension rises as...",
#             "commentary_type": "live",
#             "tension_level": 8,
#             "context_data": {...},
#             "created_at": "2025-10-13T12:00:00Z"
#         }
        
#         Errors:
#         - 400: Game not active
#         - 500: AI generation failed
#         """
#         game = self.get_object()
        
#         if game.is_completed:
#             return Response(
#                 {'error': 'Cannot generate commentary for completed game'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         try:
#             players = game.players.all().order_by('joined_at')
#             recent_events = game.events.all().order_by('-block_height')[:5]
            
#             active_players = players.filter(eliminated=False).count()
#             eliminated_players = players.filter(eliminated=True).count()
            
#             recent_actions = []
#             for event in recent_events:
#                 recent_actions.append({
#                     'type': event.get_event_type_display(),
#                     'round': event.event_data.get('round', '?'),
#                     'player': event.player_address[:8] + '...' if event.player_address else 'N/A'
#                 })
            
#             tension_level = self._calculate_tension_level(game, active_players)
            
#             game_context = f"""
#                 Current Game State:
#                 - Game ID: {game.game_id}
#                 - Current Round: {game.current_round}
#                 - Players Remaining: {active_players} of {players.count()}
#                 - Prize Pool: {game.prize_pool} STX
#                 - Tension Level: {tension_level}/10

#                 Recent Actions (last 5):
#                 {chr(10).join([f"Round {a['round']}: {a['type']} - {a['player']}" for a in recent_actions])}

#                 Active Players:
#                 {chr(10).join([f"- {p.wallet_address[:12]}... {'(Risk Mode Active)' if p.used_risk_mode else ''}" for p in players.filter(eliminated=False)])}
#                 """
            
#             # Use Gemini Flash for fast, cost-effective commentary
#             model = genai.GenerativeModel('gemini-1.5-flash-001')
            
#             prompt = f"""You are a live sports commentator for a blockchain Russian Roulette game. 
#                 Provide exciting, real-time commentary on the current game state.

#                 Style: Energetic, suspenseful, focus on the drama of the moment.
#                 Keep it to 2-3 punchy sentences about what's happening RIGHT NOW.
#                 Make it feel like a live broadcast.

#                 {game_context}

#                 Commentary:"""
            
#             response = model.generate_content(prompt)
#             commentary_text = response.text
            
#             commentary = GameCommentary.objects.create(
#                 game=game,
#                 round_number=game.current_round,
#                 commentary_text=commentary_text,
#                 commentary_type='live',
#                 tension_level=tension_level,
#                 context_data={
#                     'active_players': active_players,
#                     'recent_events': recent_actions,
#                     'prize_pool': str(game.prize_pool)
#                 }
#             )
            
#             serializer = GameCommentarySerializer(commentary)
#             return Response(serializer.data, status=status.HTTP_201_CREATED)
            
#         except Exception as e:
#             return Response(
#                 {'error': f'Failed to generate commentary: {str(e)}'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
    
#     @action(detail=True, methods=['get'])
#     def commentaries(self, request, pk=None):
#         """
#         Get all AI commentaries for a game
        
#         Method: GET
#         Endpoint: /api/games/{game_id}/commentaries/
        
#         Query Parameters:
#         - type: Filter by commentary type (live, prediction, analysis, highlight)
#         - limit: Number of commentaries to return (default: 10)
        
#         Response:
#         [
#             {
#                 "id": 123,
#                 "round_number": 5,
#                 "commentary_text": "...",
#                 "commentary_type": "live",
#                 "tension_level": 8,
#                 "created_at": "..."
#             },
#             ...
#         ]
#         """
#         game = self.get_object()
#         commentaries = GameCommentary.objects.filter(game=game)
        
#         commentary_type = request.query_params.get('type', None)
#         if commentary_type:
#             commentaries = commentaries.filter(commentary_type=commentary_type)
        
#         limit = int(request.query_params.get('limit', 10))
#         commentaries = commentaries.order_by('-created_at')[:limit]
        
#         serializer = GameCommentarySerializer(commentaries, many=True)
#         return Response(serializer.data)
    
#     @action(detail=True, methods=['post'])
#     def generate_summary(self, request, pk=None):
#         """
#         Generate comprehensive AI summary for completed game
        
#         Method: POST
#         Endpoint: /api/games/{game_id}/generate_summary/
        
#         Request Body: None
        
#         Response:
#         {
#             "id": 456,
#             "game": 1,
#             "ai_summary": "In a battle of nerves and luck...",
#             "total_rounds": 12,
#             "total_spins": 48,
#             "elimination_order": [...],
#             "key_moments": [...],
#             "statistics": {
#                 "average_spins_per_round": 4.0,
#                 "shield_uses": 3,
#                 "risk_mode_uses": 2,
#                 "survival_rate": 16.67
#             },
#             "excitement_rating": 9,
#             "generated_at": "2025-10-13T12:00:00Z"
#         }
        
#         Errors:
#         - 400: Game not completed
#         - 200: Summary already exists (returns existing)
#         - 500: AI generation failed
#         """
#         game = self.get_object()
        
#         if not game.is_completed:
#             return Response(
#                 {'error': 'Game must be completed to generate summary'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         if hasattr(game, 'summary'):
#             serializer = GameSummarySerializer(game.summary)
#             return Response(
#                 {
#                     'message': 'Summary already exists',
#                     'data': serializer.data
#                 },
#                 status=status.HTTP_200_OK
#             )
        
#         try:
#             players = game.players.all().order_by('joined_at')
#             events = game.events.all().order_by('block_height')
            
#             elimination_order = []
#             for player in players.filter(eliminated=True).order_by('eliminated_round'):
#                 elimination_order.append({
#                     'address': player.wallet_address,
#                     'round': player.eliminated_round
#                 })
            
#             total_spins = events.filter(
#                 event_type__in=['player_survived', 'player_eliminated']
#             ).count()
            
#             timeline = []
#             for event in events[:50]:  # Limit to first 50 events
#                 event_desc = f"Round {event.event_data.get('round', '?')}: {event.get_event_type_display()}"
#                 if event.player_address:
#                     event_desc += f" - {event.player_address[:8]}..."
#                 timeline.append(event_desc)
            
#             game_context = f"""
#                 Game Summary Data:
#                 - Game ID: {game.game_id}
#                 - Stake Amount: {game.stake_amount} STX per player
#                 - Total Prize Pool: {game.prize_pool} STX
#                 - Total Players: {players.count()}
#                 - Total Rounds: {game.current_round}
#                 - Total Spins: {total_spins}
#                 - Winner: {game.winner_address[:10] if game.winner_address else 'N/A'}...

#                 Players (in join order):
#                 {chr(10).join([f'{i+1}. {p.wallet_address[:10]}... {"🏆 WINNER" if p.wallet_address == game.winner_address else f"💀 Eliminated Round {p.eliminated_round}" if p.eliminated else ""}' for i, p in enumerate(players)])}

#                 Game Timeline:
#                 {chr(10).join(timeline)}

#                 Elimination Order:
#                 {chr(10).join([f"{i+1}. {e['address'][:10]}... - Round {e['round']}" for i, e in enumerate(elimination_order)])}
#                 """
            
#             model = genai.GenerativeModel('gemini-1.5-pro')
            
#             prompt = f"""You are a master storyteller recounting an epic Russian Roulette game on the Stacks blockchain. 
#                     Write a compelling narrative summary that captures the full arc of this game.

#                     Structure your response:
#                     1. **The Setup** - Set the stakes and introduce the battle (2-3 sentences)
#                     2. **Rising Action** - Chronicle key eliminations and tense moments (3-4 sentences)
#                     3. **The Climax** - Build to the final showdown (2-3 sentences)
#                     4. **The Resolution** - Winner announcement and reflection (2 sentences)
#                     5. **Strategy Analysis** - Brief tactical insights (2-3 sentences)

#                     {game_context}

#                     Write in an engaging, dramatic style. Use metaphors from poker, warfare, or gladiatorial combat.
#                     Keep it under 400 words. Make readers feel the tension and excitement."""
                                
#             response = model.generate_content(prompt)
#             ai_summary = response.text
            
#             key_moments = self._extract_key_moments(events, players, game)
            
#             statistics = {
#                 'average_spins_per_round': round(total_spins / game.current_round, 2) if game.current_round > 0 else 0,
#                 'shield_uses': events.filter(event_type='shield_used').count(),
#                 'risk_mode_uses': players.filter(used_risk_mode=True).count(),
#                 'survival_rate': round((1 / players.count()) * 100, 2) if players.count() > 0 else 0,
#                 'longest_game_duration': game.current_round,
#                 'total_prize_pool': str(game.prize_pool)
#             }
            
#             excitement_rating = self._calculate_excitement_rating(
#                 game.current_round,
#                 players.count(),
#                 key_moments,
#                 total_spins
#             )
            
#             summary = GameSummary.objects.create(
#                 game=game,
#                 ai_summary=ai_summary,
#                 total_rounds=game.current_round,
#                 total_spins=total_spins,
#                 elimination_order=elimination_order,
#                 key_moments=key_moments,
#                 statistics=statistics,
#                 excitement_rating=excitement_rating
#             )
            
#             serializer = GameSummarySerializer(summary)
#             return Response(serializer.data, status=status.HTTP_201_CREATED)
            
#         except Exception as e:
#             return Response(
#                 {'error': f'Failed to generate summary: {str(e)}'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
    
#     @action(detail=True, methods=['get'])
#     def summary(self, request, pk=None):
#         """
#         Get existing AI summary for a game
        
#         Method: GET
#         Endpoint: /api/games/{game_id}/summary/
        
#         Response: GameSummary object (see generate_summary for structure)
        
#         Errors:
#         - 404: No summary found
#         """
#         game = self.get_object()
        
#         if not hasattr(game, 'summary'):
#             return Response(
#                 {'error': 'No summary found. Generate one first using POST /api/games/{id}/generate_summary/'},
#                 status=status.HTTP_404_NOT_FOUND
#             )
        
#         serializer = GameSummarySerializer(game.summary)
#         return Response(serializer.data)
    
#     @action(detail=True, methods=['post'])
#     def predict_outcome(self, request, pk=None):
#         """
#         AI-powered prediction of game outcome
        
#         Method: POST
#         Endpoint: /api/games/{game_id}/predict_outcome/
        
#         Request Body: None
        
#         Response:
#         {
#             "game_id": 1,
#             "round": 5,
#             "predictions": [
#                 {
#                     "player": "SP2J6Z...",
#                     "win_probability": 45.5,
#                     "reasoning": "Strong survival rate, conservative play"
#                 },
#                 ...
#             ],
#             "next_elimination": {
#                 "player": "SP9M2N...",
#                 "likelihood": "High",
#                 "reasoning": "Weakest position"
#             },
#             "rounds_remaining": 3,
#             "confidence_level": "medium"
#         }
        
#         Errors:
#         - 400: Game already completed
#         - 500: Prediction failed
        
#         Note: Results are cached for 5 minutes per round
#         """
#         game = self.get_object()
        
#         if game.is_completed:
#             return Response(
#                 {'error': 'Game already completed'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         try:
#             cache_key = f'game_prediction_{game.game_id}_{game.current_round}'
#             cached_prediction = cache.get(cache_key)
            
#             if cached_prediction:
#                 return Response(cached_prediction)
            
#             players = game.players.filter(eliminated=False)
#             events = game.events.all()
            
#             player_stats = []
#             for player in players:
#                 player_events = events.filter(player_address=player.wallet_address)
#                 survival_count = player_events.filter(event_type='player_survived').count()
                
#                 player_stats.append({
#                     'address': player.wallet_address[:10] + '...',
#                     'full_address': player.wallet_address,
#                     'survival_count': survival_count,
#                     'risk_mode_active': player.used_risk_mode,
#                     'position': list(players).index(player) + 1
#                 })
            
#             context = f"""
#                 Analyze this Russian Roulette game and predict outcomes.

#                 Current Game State:
#                 - Round: {game.current_round}
#                 - Players Remaining: {players.count()}
#                 - Prize Pool: {game.prize_pool} STX

#                 Player Statistics:
#                 {chr(10).join([f"Player {p['address']}: {p['survival_count']} survivals, Risk Mode: {p['risk_mode_active']}, Position: {p['position']}" for p in player_stats])}

#                 Provide predictions in JSON format with:
#                 1. win_probability for each player (percentages that sum to 100)
#                 2. reasoning for each player's chances
#                 3. most_likely_next_elimination with player and reasoning
#                 4. estimated_rounds_remaining
#                 5. confidence_level (low/medium/high)
#                 """
            
#             model = genai.GenerativeModel(
#                 'gemini-1.5-flash',
#                 generation_config={
#                     "response_mime_type": "application/json"
#                 }
#             )
            
#             response = model.generate_content(context)
#             prediction_json = json.loads(response.text)
            
#             prediction_data = {
#                 'game_id': game.game_id,
#                 'round': game.current_round,
#                 'predictions': prediction_json.get('predictions', []),
#                 'next_elimination': prediction_json.get('next_elimination', {}),
#                 'rounds_remaining': prediction_json.get('rounds_remaining', 0),
#                 'confidence_level': prediction_json.get('confidence_level', 'medium'),
#                 'generated_at': game.current_round
#             }
            
#             cache.set(cache_key, prediction_data, 300)  
            
#             return Response(prediction_data, status=status.HTTP_200_OK)
            
#         except Exception as e:
#             return Response(
#                 {'error': f'Failed to generate prediction: {str(e)}'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
    
#     @action(detail=False, methods=['post'])
#     def compare_strategies(self, request):
#         """
#         Compare strategies of multiple players
        
#         Method: POST
#         Endpoint: /api/games/compare_strategies/
        
#         Request Body:
#         {
#             "wallets": ["SP2J6ZY...", "SP1K8DH...", "SP9M2NQ..."]
#         }
        
#         Response:
#         {
#             "player_stats": [
#                 {
#                     "wallet": "SP2J6Z...",
#                     "games_played": 15,
#                     "wins": 3,
#                     "win_rate": 20.0,
#                     "risk_mode_usage": 5,
#                     "average_survival_rounds": 4.2
#                 },
#                 ...
#             ],
#             "ai_analysis": "Player comparison analysis...",
#             "head_to_head_prediction": "SP2J6Z... most likely to win"
#         }
        
#         Errors:
#         - 400: Less than 2 wallets provided
#         - 500: Analysis failed
#         """
#         wallet_addresses = request.data.get('wallets', [])
        
#         if not wallet_addresses or len(wallet_addresses) < 2:
#             return Response(
#                 {'error': 'Provide at least 2 wallet addresses to compare'},
#                 status=status.HTTP_400_BAD_REQUEST
#             )
        
#         try:
#             player_analyses = []
            
#             for wallet in wallet_addresses[:6]:  # Limit to 6 players
#                 games = Game.objects.filter(players__wallet_address=wallet)
#                 player_data = Player.objects.filter(wallet_address=wallet)
                
#                 total_games = games.count()
#                 wins = games.filter(winner_address=wallet).count()
                
#                 analysis = {
#                     'wallet': wallet[:10] + '...',
#                     'full_wallet': wallet,
#                     'games_played': total_games,
#                     'wins': wins,
#                     'win_rate': round((wins / total_games * 100), 2) if total_games > 0 else 0,
#                     'risk_mode_usage': player_data.filter(used_risk_mode=True).count(),
#                     'average_survival_rounds': round(
#                         sum([p.eliminated_round or 0 for p in player_data]) / total_games, 2
#                     ) if total_games > 0 else 0
#                 }
#                 player_analyses.append(analysis)
            
#             context = f"""
#                     Compare these Russian Roulette players' performance and strategies:

#                     {chr(10).join([f"Player {p['wallet']}:{chr(10)}- Games: {p['games_played']}, Wins: {p['wins']} ({p['win_rate']}%){chr(10)}- Risk Mode Usage: {p['risk_mode_usage']} times{chr(10)}- Avg Survival: {p['average_survival_rounds']} rounds{chr(10)}" for p in player_analyses])}

#                     Provide:
#                     1. Strategic assessment of each player
#                     2. Strengths and weaknesses comparison
#                     3. Head-to-head matchup prediction
#                     4. Strategy recommendations

#                     Be insightful like a professional analyst.
#                     """
            
#             model = genai.GenerativeModel('gemini-1.5-flash')
#             response = model.generate_content(context)
            
#             return Response({
#                 'player_stats': player_analyses,
#                 'ai_analysis': response.text
#             }, status=status.HTTP_200_OK)
            
#         except Exception as e:
#             return Response(
#                 {'error': f'Failed to compare strategies: {str(e)}'},
#                 status=status.HTTP_500_INTERNAL_SERVER_ERROR
#             )
    
#     def _calculate_tension_level(self, game, active_players):
#         """Calculate tension level 1-10"""
#         total_players = game.players.count()
#         rounds = game.current_round
        
#         player_factor = (1 - (active_players / total_players)) * 5
#         round_factor = min(rounds / 10, 1) * 3
        
#         recent_eliminations = game.events.filter(
#             event_type='player_eliminated'
#         ).order_by('-block_height')[:2].count()
        
#         elimination_factor = recent_eliminations * 1
        
#         return min(round(player_factor + round_factor + elimination_factor), 10)
    
#     def _extract_key_moments(self, events, players, game):
#         """Extract significant game moments"""
#         key_moments = []
        
#         for shield_event in events.filter(event_type='shield_used'):
#             key_moments.append({
#                 'type': 'shield_used',
#                 'round': shield_event.event_data.get('round'),
#                 'player': shield_event.player_address[:10] + '...',
#                 'impact': 'high'
#             })
        
#         first_elim = events.filter(event_type='player_eliminated').first()
#         if first_elim:
#             key_moments.append({
#                 'type': 'first_blood',
#                 'round': first_elim.event_data.get('round'),
#                 'player': first_elim.player_address[:10] + '...',
#                 'impact': 'medium'
#             })
        
#         eliminations = list(events.filter(event_type='player_eliminated').order_by('block_height'))
#         for i in range(len(eliminations) - 1):
#             round_diff = eliminations[i+1].event_data.get('round', 0) - eliminations[i].event_data.get('round', 0)
#             if round_diff <= 1:
#                 key_moments.append({
#                     'type': 'rapid_eliminations',
#                     'round': eliminations[i].event_data.get('round'),
#                     'impact': 'high'
#                 })
#                 break
        
#         return key_moments
    
#     def _calculate_excitement_rating(self, rounds, player_count, key_moments, total_spins):
#         """Calculate excitement rating 1-10"""
#         base_score = 5
        
#         if rounds > 10:
#             base_score += 2
#         elif rounds > 5:
#             base_score += 1
        
#         if player_count > 5:
#             base_score += 1
        
#         high_impact = len([m for m in key_moments if m.get('impact') == 'high'])
#         base_score += min(high_impact, 2)
        
#         return min(base_score, 10)


# class GameSummaryViewSet(viewsets.ReadOnlyModelViewSet):
#     """
#     ViewSet for browsing game summaries
    
#     Endpoints:
#     - GET /api/summaries/ - List all summaries
#     - GET /api/summaries/{id}/ - Get specific summary
    
#     Query Parameters:
#     - wallet: Filter by player wallet address
#     """
#     queryset = GameSummary.objects.all().select_related('game')
#     serializer_class = GameSummarySerializer
#     permission_classes = [AllowAny]
    
#     def get_queryset(self):
#         queryset = super().get_queryset()
        
#         wallet = self.request.query_params.get('wallet', None)
#         if wallet:
#             queryset = queryset.filter(game__players__wallet_address=wallet)
        
#         return queryset.order_by('-generated_at')


from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.shortcuts import get_object_or_404
from django.db.models import Q, Count
from django.core.cache import cache
from .models import Game, Player, GameSummary, GameCommentary
from .serializers import ( 
    GameEventSerializer, GameSummarySerializer,
    GameDetailSerializer, GameListSerializer,
    GameCommentarySerializer,
)
import anthropic
import os
import json

# Configure Claude
_claude_key = os.environ.get("CLAUDE_API_KEY")
try:
    anthropic_client = anthropic.Anthropic(api_key=_claude_key) if _claude_key else None
except Exception:
    anthropic_client = None

class GameViewSet(viewsets.ReadOnlyModelViewSet):
    """
    Read-only viewset for games with AI-powered features using Gemini
    """
    permission_classes = [AllowAny]
    
    def get_serializer_class(self):
        if self.action == 'retrieve':
            return GameDetailSerializer
        return GameListSerializer
    
    def get_queryset(self):
        queryset = Game.objects.all().prefetch_related('players', 'events')
        
        status_filter = self.request.query_params.get('status', None)
        if status_filter is not None:
            queryset = queryset.filter(status=int(status_filter))
        
        wallet = self.request.query_params.get('wallet', None)
        if wallet:
            queryset = queryset.filter(players__wallet_address=wallet)
        
        return queryset.order_by('-created_at')
    
    @action(detail=True, methods=['get'])
    def events(self, request, pk=None):
        """
        Get all events for a specific game
        
        Query Parameters:
        - type: Filter by event type (optional)
        
        Returns: List of game events
        """
        game = self.get_object()
        events = game.events.all()
        
        event_type = request.query_params.get('type', None)
        if event_type:
            events = events.filter(event_type=event_type)
        
        serializer = GameEventSerializer(events, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def generate_live_commentary(self, request, pk=None):
        """
        Generate AI-powered live commentary for current game state
        
        Method: POST
        Endpoint: /api/games/{game_id}/generate_live_commentary/
        
        Request Body: None
        
        Response:
        {
            "id": 123,
            "game": 1,
            "round_number": 5,
            "commentary_text": "The tension rises as...",
            "commentary_type": "live",
            "tension_level": 8,
            "context_data": {...},
            "created_at": "2025-10-13T12:00:00Z"
        }
        
        Errors:
        - 400: Game not active
        - 500: AI generation failed
        """
        game = self.get_object()
        
        if game.is_completed:
            return Response(
                {'error': 'Cannot generate commentary for completed game'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Use frontend-provided live state (blockchain data) rather than the DB
            req = request.data
            current_round = int(req.get('current_round') or game.current_round or 1)
            active_players = int(req.get('active_players') or 6)
            total_players = int(req.get('total_players') or 6)
            eliminated_count = int(req.get('eliminated_count') or 0)
            last_eliminated = req.get('last_eliminated_address')
            prize_pool_str = req.get('prize_pool') or str(game.prize_pool)

            tension_level = min(
                round(
                    ((total_players - active_players) / max(total_players, 1)) * 5
                    + min(current_round / 10, 1) * 3
                    + (1 if eliminated_count > 0 else 0)
                ),
                10,
            )

            if last_eliminated:
                last_action = (
                    f"Player {last_eliminated[:8]}... was ELIMINATED in Round {current_round}"
                )
            elif eliminated_count == 0:
                last_action = "Game just started — all 6 players are in"
            else:
                last_action = f"{eliminated_count} player(s) eliminated so far"

            game_context = f"""
                Current Game State:
                - Game ID: {game.game_id}
                - Current Round: {current_round}
                - Players Remaining: {active_players} of {total_players} ({eliminated_count} eliminated)
                - Prize Pool: {prize_pool_str} CELO on the Celo blockchain
                - Tension Level: {tension_level}/10

                Most Recent Action:
                {last_action}
                """

            prompt = f"""You are a hyped live sports commentator for a Celo blockchain Russian Roulette game.
                React directly to the MOST RECENT ACTION and the current game state.
                Reference the actual CELO prize pool, the specific round number, and how many players are left.
                DO NOT mention STX, Stacks, or any other blockchain.

                Rules:
                - 2-3 punchy sentences maximum
                - React to what JUST happened (the most recent action above)
                - Build tension around who could be eliminated NEXT
                - Reference the CELO prize pool amount to raise the stakes
                - Make it feel like you're watching it live right now

                {game_context}

                Commentary:"""
            
            if anthropic_client:
                response = anthropic_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=300,
                    messages=[{"role": "user", "content": prompt}]
                )
                commentary_text = response.content[0].text
            else:
                commentary_text = "Tension rises as the wheel spins... (Claude API not configured)"
            
            commentary = GameCommentary.objects.create(
                game=game,
                round_number=current_round,
                commentary_text=commentary_text,
                commentary_type='live',
                tension_level=tension_level,
                context_data={
                    'active_players': active_players,
                    'eliminated_count': eliminated_count,
                    'prize_pool': prize_pool_str,
                }
            )
            
            serializer = GameCommentarySerializer(commentary)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to generate commentary: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def commentaries(self, request, pk=None):
        """
        Get all AI commentaries for a game
        
        Method: GET
        Endpoint: /api/games/{game_id}/commentaries/
        
        Query Parameters:
        - type: Filter by commentary type (live, prediction, analysis, highlight)
        - limit: Number of commentaries to return (default: 10)
        
        Response:
        [
            {
                "id": 123,
                "round_number": 5,
                "commentary_text": "...",
                "commentary_type": "live",
                "tension_level": 8,
                "created_at": "..."
            },
            ...
        ]
        """
        game = self.get_object()
        commentaries = GameCommentary.objects.filter(game=game)
        
        commentary_type = request.query_params.get('type', None)
        if commentary_type:
            commentaries = commentaries.filter(commentary_type=commentary_type)
        
        limit = int(request.query_params.get('limit', 10))
        commentaries = commentaries.order_by('-created_at')[:limit]
        
        serializer = GameCommentarySerializer(commentaries, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def generate_summary(self, request, pk=None):
        """
        Generate comprehensive AI summary for completed game
        
        Method: POST
        Endpoint: /api/games/{game_id}/generate_summary/
        
        Request Body: None
        
        Response:
        {
            "id": 456,
            "game": 1,
            "ai_summary": "In a battle of nerves and luck...",
            "total_rounds": 12,
            "total_spins": 48,
            "elimination_order": [...],
            "key_moments": [...],
            "statistics": {
                "average_spins_per_round": 4.0,
                "shield_uses": 3,
                "risk_mode_uses": 2,
                "survival_rate": 16.67
            },
            "excitement_rating": 9,
            "generated_at": "2025-10-13T12:00:00Z"
        }
        
        Errors:
        - 400: Game not completed
        - 200: Summary already exists (returns existing)
        - 500: AI generation failed
        """
        game = self.get_object()
        
        if not game.is_completed:
            return Response(
                {'error': 'Game must be completed to generate summary'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if hasattr(game, 'summary'):
            serializer = GameSummarySerializer(game.summary)
            return Response(
                {
                    'message': 'Summary already exists',
                    'data': serializer.data
                },
                status=status.HTTP_200_OK
            )
        
        try:
            players = game.players.all().order_by('joined_at')
            events = game.events.all().order_by('block_height')
            
            elimination_order = []
            for player in players.filter(eliminated=True).order_by('eliminated_round'):
                elimination_order.append({
                    'address': player.wallet_address,
                    'round': player.eliminated_round
                })
            
            total_spins = events.filter(
                event_type__in=['player_survived', 'player_eliminated']
            ).count()
            
            timeline = []
            for event in events[:50]:  # Limit to first 50 events
                event_desc = f"Round {event.event_data.get('round', '?')}: {event.get_event_type_display()}"
                if event.player_address:
                    event_desc += f" - {event.player_address[:8]}..."
                timeline.append(event_desc)
            
            game_context = f"""
                Game Summary Data:
                - Game ID: {game.game_id}
                - Stake Amount: {game.stake_amount} CELO per player
                - Total Prize Pool: {game.prize_pool} CELO (on Celo blockchain)
                - Total Players: {players.count()}
                - Total Rounds: {game.current_round}
                - Total Spins: {total_spins}
                - Winner: {game.winner_address[:10] if game.winner_address else 'N/A'}...

                Players (in join order):
                {chr(10).join([f'{i+1}. {p.wallet_address[:10]}... {"🏆 WINNER" if p.wallet_address == game.winner_address else f"💀 Eliminated Round {p.eliminated_round}" if p.eliminated else ""}' for i, p in enumerate(players)])}

                Game Timeline:
                {chr(10).join(timeline)}

                Elimination Order:
                {chr(10).join([f"{i+1}. {e['address'][:10]}... - Round {e['round']}" for i, e in enumerate(elimination_order)])}
                """
            
            prompt = f"""You are a master storyteller recounting an epic Russian Roulette game on the Celo blockchain.
                    Write a compelling narrative summary. Always refer to the currency as CELO, never STX or any other token.
                    Write a compelling narrative that captures the full arc of this game.

                    Structure your response:
                    1. **The Setup** - Set the stakes and introduce the battle (2-3 sentences)
                    2. **Rising Action** - Chronicle key eliminations and tense moments (3-4 sentences)
                    3. **The Climax** - Build to the final showdown (2-3 sentences)
                    4. **The Resolution** - Winner announcement and reflection (2 sentences)
                    5. **Strategy Analysis** - Brief tactical insights (2-3 sentences)

                    {game_context}

                    Write in an engaging, dramatic style. Use metaphors from poker, warfare, or gladiatorial combat.
                    Keep it under 400 words. Make readers feel the tension and excitement."""
                                
            if anthropic_client:
                response = anthropic_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=600,
                    messages=[{"role": "user", "content": prompt}]
                )
                ai_summary = response.content[0].text
            else:
                ai_summary = "An epic game of Russian Roulette has concluded! (Claude API not configured)"
            
            key_moments = self._extract_key_moments(events, players, game)
            
            statistics = {
                'average_spins_per_round': round(total_spins / game.current_round, 2) if game.current_round > 0 else 0,
                'shield_uses': events.filter(event_type='shield_used').count(),
                'risk_mode_uses': players.filter(used_risk_mode=True).count(),
                'survival_rate': round((1 / players.count()) * 100, 2) if players.count() > 0 else 0,
                'longest_game_duration': game.current_round,
                'total_prize_pool': str(game.prize_pool)
            }
            
            excitement_rating = self._calculate_excitement_rating(
                game.current_round,
                players.count(),
                key_moments,
                total_spins
            )
            
            summary = GameSummary.objects.create(
                game=game,
                ai_summary=ai_summary,
                total_rounds=game.current_round,
                total_spins=total_spins,
                elimination_order=elimination_order,
                key_moments=key_moments,
                statistics=statistics,
                excitement_rating=excitement_rating
            )
            
            serializer = GameSummarySerializer(summary)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to generate summary: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        """
        Get existing AI summary for a game
        
        Method: GET
        Endpoint: /api/games/{game_id}/summary/
        
        Response: GameSummary object (see generate_summary for structure)
        
        Errors:
        - 404: No summary found
        """
        game = self.get_object()
        
        if not hasattr(game, 'summary'):
            return Response(
                {'error': 'No summary found. Generate one first using POST /api/games/{id}/generate_summary/'},
                status=status.HTTP_404_NOT_FOUND
            )
        
        serializer = GameSummarySerializer(game.summary)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def predict_outcome(self, request, pk=None):
        """
        AI-powered prediction of game outcome
        
        Method: POST
        Endpoint: /api/games/{game_id}/predict_outcome/
        
        Request Body: None
        
        Response:
        {
            "game_id": 1,
            "round": 5,
            "predictions": [
                {
                    "player": "SP2J6Z...",
                    "win_probability": 45.5,
                    "reasoning": "Strong survival rate, conservative play"
                },
                ...
            ],
            "next_elimination": {
                "player": "SP9M2N...",
                "likelihood": "High",
                "reasoning": "Weakest position"
            },
            "rounds_remaining": 3,
            "confidence_level": "medium"
        }
        
        Errors:
        - 400: Game already completed
        - 500: Prediction failed
        
        Note: Results are cached for 5 minutes per round
        """
        game = self.get_object()
        
        if game.is_completed:
            return Response(
                {'error': 'Game already completed'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            cache_key = f'game_prediction_{game.game_id}_{game.current_round}'
            cached_prediction = cache.get(cache_key)
            
            if cached_prediction:
                return Response(cached_prediction)
            
            players = game.players.filter(eliminated=False)
            events = game.events.all()
            
            player_stats = []
            for player in players:
                player_events = events.filter(player_address=player.wallet_address)
                survival_count = player_events.filter(event_type='player_survived').count()
                
                player_stats.append({
                    'address': player.wallet_address[:10] + '...',
                    'full_address': player.wallet_address,
                    'survival_count': survival_count,
                    'risk_mode_active': player.used_risk_mode,
                    'position': list(players).index(player) + 1
                })
            
            context = f"""
                Analyze this Russian Roulette game and predict outcomes.

                Current Game State:
                - Round: {game.current_round}
                - Players Remaining: {players.count()}
                - Prize Pool: {game.prize_pool} CELO (on Celo blockchain)

                Player Statistics:
                {chr(10).join([f"Player {p['address']}: {p['survival_count']} survivals, Risk Mode: {p['risk_mode_active']}, Position: {p['position']}" for p in player_stats])}

                Provide predictions in JSON format with:
                1. win_probability for each player (percentages that sum to 100)
                2. reasoning for each player's chances
                3. most_likely_next_elimination with player and reasoning
                4. estimated_rounds_remaining
                5. confidence_level (low/medium/high)
                """
            
            if anthropic_client:
                response = anthropic_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=600,
                    messages=[{"role": "user", "content": context}]
                )
                text = response.content[0].text
                
                if "```json" in text:
                    text = text.split("```json")[1].split("```")[0]
                elif "```" in text:
                    text = text.split("```")[1].split("```")[0]
                
                prediction_json = json.loads(text.strip())
            else:
                prediction_json = {}
            
            prediction_data = {
                'game_id': game.game_id,
                'round': game.current_round,
                'predictions': prediction_json.get('predictions', []),
                'next_elimination': prediction_json.get('next_elimination', {}),
                'rounds_remaining': prediction_json.get('rounds_remaining', 0),
                'confidence_level': prediction_json.get('confidence_level', 'medium'),
                'generated_at': game.current_round
            }
            
            cache.set(cache_key, prediction_data, 300)  
            
            return Response(prediction_data, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to generate prediction: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    @action(detail=False, methods=['post'])
    def compare_strategies(self, request):
        """
        Compare strategies of multiple players
        
        Method: POST
        Endpoint: /api/games/compare_strategies/
        
        Request Body:
        {
            "wallets": ["SP2J6ZY...", "SP1K8DH...", "SP9M2NQ..."]
        }
        
        Response:
        {
            "player_stats": [
                {
                    "wallet": "SP2J6Z...",
                    "games_played": 15,
                    "wins": 3,
                    "win_rate": 20.0,
                    "risk_mode_usage": 5,
                    "average_survival_rounds": 4.2
                },
                ...
            ],
            "ai_analysis": "Player comparison analysis...",
            "head_to_head_prediction": "SP2J6Z... most likely to win"
        }
        
        Errors:
        - 400: Less than 2 wallets provided
        - 500: Analysis failed
        """
        wallet_addresses = request.data.get('wallets', [])
        
        if not wallet_addresses or len(wallet_addresses) < 2:
            return Response(
                {'error': 'Provide at least 2 wallet addresses to compare'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            player_analyses = []
            
            for wallet in wallet_addresses[:6]:  # Limit to 6 players
                games = Game.objects.filter(players__wallet_address=wallet)
                player_data = Player.objects.filter(wallet_address=wallet)
                
                total_games = games.count()
                wins = games.filter(winner_address=wallet).count()
                
                analysis = {
                    'wallet': wallet[:10] + '...',
                    'full_wallet': wallet,
                    'games_played': total_games,
                    'wins': wins,
                    'win_rate': round((wins / total_games * 100), 2) if total_games > 0 else 0,
                    'risk_mode_usage': player_data.filter(used_risk_mode=True).count(),
                    'average_survival_rounds': round(
                        sum([p.eliminated_round or 0 for p in player_data]) / total_games, 2
                    ) if total_games > 0 else 0
                }
                player_analyses.append(analysis)
            
            context = f"""
                    Compare these Russian Roulette players' performance and strategies:

                    {chr(10).join([f"Player {p['wallet']}:{chr(10)}- Games: {p['games_played']}, Wins: {p['wins']} ({p['win_rate']}%){chr(10)}- Risk Mode Usage: {p['risk_mode_usage']} times{chr(10)}- Avg Survival: {p['average_survival_rounds']} rounds{chr(10)}" for p in player_analyses])}

                    Provide:
                    1. Strategic assessment of each player
                    2. Strengths and weaknesses comparison
                    3. Head-to-head matchup prediction
                    4. Strategy recommendations

                    Be insightful like a professional analyst.
                    """
            
            if anthropic_client:
                response = anthropic_client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=700,
                    messages=[{"role": "user", "content": context}]
                )
                ai_analysis = response.content[0].text
            else:
                ai_analysis = "Strategy analysis not available (Claude API not configured)."
            
            return Response({
                'player_stats': player_analyses,
                'ai_analysis': ai_analysis
            }, status=status.HTTP_200_OK)
            
        except Exception as e:
            return Response(
                {'error': f'Failed to compare strategies: {str(e)}'},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
    
    def _calculate_tension_level(self, game, active_players):
        """Calculate tension level 1-10"""
        total_players = game.players.count()
        rounds = game.current_round
        
        player_factor = (1 - (active_players / total_players)) * 5
        round_factor = min(rounds / 10, 1) * 3
        
        recent_eliminations = game.events.filter(
            event_type='player_eliminated'
        ).order_by('-block_height')[:2].count()
        
        elimination_factor = recent_eliminations * 1
        
        return min(round(player_factor + round_factor + elimination_factor), 10)
    
    def _extract_key_moments(self, events, players, game):
        """Extract significant game moments"""
        key_moments = []
        
        for shield_event in events.filter(event_type='shield_used'):
            key_moments.append({
                'type': 'shield_used',
                'round': shield_event.event_data.get('round'),
                'player': shield_event.player_address[:10] + '...',
                'impact': 'high'
            })
        
        first_elim = events.filter(event_type='player_eliminated').first()
        if first_elim:
            key_moments.append({
                'type': 'first_blood',
                'round': first_elim.event_data.get('round'),
                'player': first_elim.player_address[:10] + '...',
                'impact': 'medium'
            })
        
        eliminations = list(events.filter(event_type='player_eliminated').order_by('block_height'))
        for i in range(len(eliminations) - 1):
            round_diff = eliminations[i+1].event_data.get('round', 0) - eliminations[i].event_data.get('round', 0)
            if round_diff <= 1:
                key_moments.append({
                    'type': 'rapid_eliminations',
                    'round': eliminations[i].event_data.get('round'),
                    'impact': 'high'
                })
                break
        
        return key_moments
    
    def _calculate_excitement_rating(self, rounds, player_count, key_moments, total_spins):
        """Calculate excitement rating 1-10"""
        base_score = 5
        
        if rounds > 10:
            base_score += 2
        elif rounds > 5:
            base_score += 1
        
        if player_count > 5:
            base_score += 1
        
        high_impact = len([m for m in key_moments if m.get('impact') == 'high'])
        base_score += min(high_impact, 2)
        
        return min(base_score, 10)


class GameSummaryViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for browsing game summaries
    
    Endpoints:
    - GET /api/summaries/ - List all summaries
    - GET /api/summaries/{id}/ - Get specific summary
    
    Query Parameters:
    - wallet: Filter by player wallet address
    """
    queryset = GameSummary.objects.all().select_related('game')
    serializer_class = GameSummarySerializer
    permission_classes = [AllowAny]
    
    def get_queryset(self):
        queryset = super().get_queryset()
        
        wallet = self.request.query_params.get('wallet', None)
        if wallet:
            queryset = queryset.filter(game__players__wallet_address=wallet)
        
        return queryset.order_by('-generated_at')