# GPT-5 Migration Plan

## Current Status: Reverted to GPT-4.1

**Date**: 2025-08-24
**Decision**: Reverted to GPT-4.1 models due to performance issues

## Performance Analysis

### GPT-4.1 vs GPT-5 Response Times
- **GPT-4.1**: 0.45-0.83 seconds
- **GPT-5**: 2.70-3.72 seconds (~5x slower)

### Impact on User Experience
- **Task Classification**: Real-time operation, speed critical
- **Email Summaries**: Background job, can tolerate latency
- **Chat/Journal**: Interactive features, need responsive feel

## Migration Strategy (Phased Approach)

### Phase 1: Background Jobs Only
**Timeline**: When GPT-5 latency improves or becomes acceptable
- Migrate `email_summary.py` first (least time-sensitive)
- Update timeout to 15+ seconds
- Monitor performance and quality improvements

### Phase 2: Interactive Features
**Timeline**: After Phase 1 validation + GPT-5 speed improvements
- Migrate `journals.py` (AI summarization)
- Migrate `chatbot.py` (Q&A feature)
- Keep user-facing timeouts reasonable (8-10s max)

### Phase 3: Real-time Classification
**Timeline**: Only when GPT-5 achieves <2s response times
- Migrate `classify.py` last (most latency-sensitive)
- Requires sub-second responses for good UX

## Technical Implementation Plan

### Configuration Management
```python
# Add to environment variables or config
GPT5_ENABLED=false
GPT5_EMAIL_ENABLED=false
GPT5_CHAT_ENABLED=false
GPT5_CLASSIFY_ENABLED=false
```

### Model Selection Helper
```python
def get_model_name(feature: str) -> str:
    """Get appropriate model based on feature and GPT-5 rollout status"""
    gpt5_map = {
        "classify": "gpt-5-nano" if os.getenv("GPT5_CLASSIFY_ENABLED") == "true" else "gpt-4.1-nano",
        "chat": "gpt-5-mini" if os.getenv("GPT5_CHAT_ENABLED") == "true" else "gpt-4.1-mini",
        "email": "gpt-5" if os.getenv("GPT5_EMAIL_ENABLED") == "true" else "gpt-4.1",
        "journal": "gpt-5-mini" if os.getenv("GPT5_CHAT_ENABLED") == "true" else "gpt-4.1-mini"
    }
    return gpt5_map.get(feature, "gpt-4.1")
```

### Timeout Strategy
```python
def get_timeout(model: str) -> float:
    """Get appropriate timeout based on model"""
    if model.startswith("gpt-5"):
        return 15.0  # GPT-5 needs more time
    return 10.0      # GPT-4.1 is faster
```

### Parameter Compatibility
```python
def get_completion_params(model: str) -> dict:
    """Get model-specific parameters"""
    base_params = {"model": model}

    if model.startswith("gpt-5"):
        # GPT-5 restrictions: no temperature=0, default temp only
        return base_params
    else:
        # GPT-4.1 supports all parameters
        base_params["temperature"] = 0
        return base_params
```

## Quality Validation Plan

### A/B Testing Framework
1. **Dual Responses**: Run both GPT-4.1 and GPT-5 in parallel
2. **Quality Metrics**: Compare classification accuracy, email quality, chat relevance
3. **User Feedback**: Monitor support requests and user satisfaction
4. **Performance Monitoring**: Track response times and timeout rates

### Rollback Strategy
- Keep GPT-4.1 as fallback for all services
- Implement circuit breaker pattern for GPT-5 timeouts
- Quick config toggle to disable GPT-5 if issues arise

## Migration Checklist

### Pre-Migration
- [ ] Monitor GPT-5 performance improvements monthly
- [ ] Implement configuration management system
- [ ] Create A/B testing framework
- [ ] Set up enhanced monitoring and alerting

### Phase 1 (Email Only)
- [ ] GPT-5 response time <5s consistently
- [ ] Update email_summary.py with feature toggle
- [ ] Deploy with GPT5_EMAIL_ENABLED=true
- [ ] Monitor for 2 weeks, validate quality

### Phase 2 (Chat & Journal)
- [ ] GPT-5 response time <3s consistently
- [ ] Migrate journals.py and chatbot.py
- [ ] A/B test with 10% of users initially
- [ ] Full rollout after validation

### Phase 3 (Classification)
- [ ] GPT-5 response time <2s consistently
- [ ] Migrate classify.py with extensive testing
- [ ] Monitor task classification accuracy
- [ ] Performance impact on todo creation flow

## Success Criteria

- **Performance**: GPT-5 responses within acceptable limits per feature
- **Quality**: Equal or improved AI output quality vs GPT-4.1
- **Reliability**: <1% timeout rate across all services
- **User Experience**: No noticeable degradation in app responsiveness

## Risk Mitigation

1. **Performance Regression**: Automatic fallback to GPT-4.1
2. **API Changes**: Version pinning and compatibility testing
3. **Cost Impact**: Monitor usage and implement cost controls
4. **Quality Issues**: Comparison testing and user feedback monitoring

---

**Next Review**: Monthly assessment of GPT-5 performance metrics
**Owner**: Development Team
**Status**: Planning Phase
